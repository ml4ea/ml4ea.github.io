import { BookOpen, CheckCircle2, Clock3, Download, ExternalLink, GraduationCap, Library, LockKeyhole, MessageSquareText, Send, ShieldAlert, UsersRound } from 'lucide-react';
import { type SubmitEvent, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { institutionalEmailMessage, usesPersonalEmailProvider } from '../lib/emailEligibility';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

interface Application {
  id: string;
  email: string;
  institution: string;
  department: string;
  position_title: string;
  faculty_url: string;
  course_context: string | null;
  status: 'pending' | 'approved' | 'rejected';
  decision_note: string | null;
  updated_at: string;
}

interface InstructorResource {
  id: string;
  title: string;
  description: string;
  category: string;
  storage_path: string;
}

const emptyForm = {
  institution: '',
  department: '',
  positionTitle: '',
  facultyUrl: '',
  courseContext: '',
};

export default function InstructorPortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [approved, setApproved] = useState(false);
  const [resources, setResources] = useState<InstructorResource[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadWorkspace = async (activeSession: Session | null) => {
    const supabase = getSupabaseClient();
    if (!supabase || !activeSession) {
      setApplication(null);
      setApproved(false);
      setResources([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const { error: claimError } = await supabase.rpc('claim_preapproved_instructor_access');
    if (claimError) {
      setError(claimError.message);
      setLoading(false);
      return;
    }

    const [{ data, error: applicationError }, { data: approvedAccess, error: accessError }] = await Promise.all([
      supabase
        .from('instructor_applications')
        .select('id,email,institution,department,position_title,faculty_url,course_context,status,decision_note,updated_at')
        .eq('user_id', activeSession.user.id)
        .maybeSingle(),
      supabase.rpc('is_approved_instructor'),
    ]);

    if (applicationError || accessError) {
      setError(applicationError?.message ?? accessError?.message ?? 'Instructor access could not be checked.');
      setLoading(false);
      return;
    }

    const currentApplication = data as Application | null;
    const hasApprovedAccess = Boolean(approvedAccess);
    setApplication(currentApplication);
    setApproved(hasApprovedAccess);
    if (currentApplication) {
      setForm({
        institution: currentApplication.institution,
        department: currentApplication.department,
        positionTitle: currentApplication.position_title,
        facultyUrl: currentApplication.faculty_url,
        courseContext: currentApplication.course_context ?? '',
      });
    }

    if (hasApprovedAccess) {
      const { data: resourceData, error: resourceError } = await supabase
        .from('instructor_resources')
        .select('id,title,description,category,storage_path')
        .eq('published', true)
        .neq('category', 'Community contribution')
        .order('sort_order');
      if (resourceError) setError(resourceError.message);
      setResources((resourceData ?? []) as InstructorResource[]);
    } else {
      setResources([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      void loadWorkspace(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      window.setTimeout(() => void loadWorkspace(nextSession), 0);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const submitApplication = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (usesPersonalEmailProvider(session?.user.email)) {
      setError(institutionalEmailMessage);
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');
    const { data: submittedApplication, error: submitError } = await supabase.rpc('submit_instructor_application', {
      p_institution: form.institution.trim(),
      p_department: form.department.trim(),
      p_position_title: form.positionTitle,
      p_faculty_url: form.facultyUrl.trim(),
      p_course_context: form.courseContext.trim() || null,
    });
    if (submitError) {
      setSubmitting(false);
      setError(submitError.message);
      return;
    }
    const applicationId = (submittedApplication as Application | null)?.id;
    const { error: notificationError } = applicationId ? await supabase.functions.invoke('notify-instructor-decision', {
      body: { applicationId, notificationType: 'submission' },
    }) : { error: new Error('The submitted application ID was not returned.') };
    setSubmitting(false);
    if (notificationError) {
      setNotice('Your application was submitted for review.');
      setError('The application was saved, but the administrator notification email could not be sent.');
    } else {
      setNotice('Your application was submitted and the administrator was notified.');
    }
    await loadWorkspace(session);
  };

  const downloadResource = async (resource: InstructorResource) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setError('');
    const { data, error: downloadError } = await supabase.storage
      .from('instructor-materials')
      .createSignedUrl(resource.storage_path, 60);
    if (downloadError) {
      setError(downloadError.message);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  if (!isSupabaseConfigured) {
    return <div className="account-state"><LockKeyhole aria-hidden="true" size={28} /><div><h2>Instructor access is being connected.</h2><p>The protected workspace will open after the account service and private resource bucket are configured.</p></div></div>;
  }

  if (loading) return <p className="account-loading" aria-live="polite">Checking instructor access…</p>;

  if (!session) {
    return <div className="account-state"><GraduationCap aria-hidden="true" size={28} /><div><h2>Sign in or request instructor access.</h2><p>Use the email address associated with your institution. Email verification is required for new requests.</p><a className="button button-primary" href="/account?next=/instructor">Sign in or create an account</a></div></div>;
  }

  if (!approved && application?.status === 'approved' && application.email.toLowerCase() !== session.user.email?.toLowerCase()) {
    return <div className="account-state account-unconfigured"><ShieldAlert aria-hidden="true" size={28} /><div><h2>Your approved email no longer matches this account.</h2><p>Protected access has been paused. Sign in with the originally approved institutional address or contact the portal administrator for a new review.</p></div></div>;
  }

  if (approved) {
    return (
      <div className="instructor-approved">
        <div className="access-status access-approved"><CheckCircle2 aria-hidden="true" size={24} /><div><p className="eyebrow">Approved instructor</p><h2>Protected teaching resources</h2><p>Signed downloads expire after 60 seconds and require your approved account.</p></div></div>
        <div className="online-manual-action">
          <BookOpen aria-hidden="true" size={27} />
          <div><p className="eyebrow">Online edition</p><h3>Instructor’s Manual</h3><p>Browse teaching guidance, chapter notes, assessment ideas, and course-planning resources online.</p></div>
          <a className="button button-primary" href="/instructor/manual/">Open manual <ExternalLink aria-hidden="true" size={16} /></a>
        </div>
        <div className="online-manual-action toolkit-workspace-action">
          <Library aria-hidden="true" size={27} />
          <div><p className="eyebrow">Planning and assessment</p><h3>Teaching Toolkit</h3><p>Build a course plan, select AEs, and download editable syllabus, assignment, rubric, policy, and setup templates.</p></div>
          <a className="button button-primary" href="/instructor/toolkit/">Open toolkit <ExternalLink aria-hidden="true" size={16} /></a>
        </div>
        <div className="instructor-community-actions">
          <a href="/community/?category=teaching-practice">
            <MessageSquareText aria-hidden="true" size={26} />
            <div><p className="eyebrow">Closed instructor space</p><h3>Discussion Forum</h3><p>Exchange teaching experience, course structures, assessment approaches, and classroom questions with verified instructors.</p><span>Open forum <ExternalLink aria-hidden="true" size={15} /></span></div>
          </a>
          <a href="/instructor/contributions/">
            <UsersRound aria-hidden="true" size={26} />
            <div><p className="eyebrow">Reviewed collection</p><h3>Curated Teaching Contributions</h3><p>Browse community-contributed syllabi, activities, rubrics, assignments, and teaching notes after review.</p><span>Browse collection <ExternalLink aria-hidden="true" size={15} /></span></div>
          </a>
        </div>
        {resources.length > 0 ? (
          <div className="instructor-resource-list">
            {resources.map((resource) => (
              <article key={resource.id}>
                <div><span>{resource.category}</span><h3>{resource.title}</h3><p>{resource.description}</p></div>
                <button className="button button-secondary" type="button" onClick={() => downloadResource(resource)}><Download aria-hidden="true" size={17} /> Download</button>
              </article>
            ))}
          </div>
        ) : <p className="resource-empty">Your access is approved. Protected resources will appear here as they are published.</p>}
        {error && <p className="form-message form-error" role="alert">{error}</p>}
      </div>
    );
  }

  const personalEmailBlocked = usesPersonalEmailProvider(session.user.email);

  return (
    <div className="instructor-application-grid">
      <form className="instructor-form" onSubmit={submitApplication}>
        <p className="eyebrow">Instructor application</p>
        <h2>{application ? 'Update and resubmit your information.' : 'Tell us about your teaching role.'}</h2>
        <p className="verified-email"><CheckCircle2 aria-hidden="true" size={17} /> Verified email: <strong>{session.user.email}</strong></p>
        {personalEmailBlocked && (
          <div className="form-message form-error institutional-email-warning" role="alert">
            <ShieldAlert aria-hidden="true" size={19} />
            <p><strong>Use an institutional email for an instructor request.</strong> {institutionalEmailMessage}</p>
          </div>
        )}
        <div className="form-grid">
          <label><span>Institution</span><input required value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} autoComplete="organization" /></label>
          <label><span>Department</span><input required value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label>
          <label><span>Position</span><select required value={form.positionTitle} onChange={(event) => setForm({ ...form, positionTitle: event.target.value })}><option value="">Select a position</option><option>Professor</option><option>Associate Professor</option><option>Assistant Professor</option><option>Lecturer</option><option>Instructor</option><option>Adjunct Faculty</option><option>Teaching Assistant</option><option>Other teaching role</option></select></label>
          <label><span>Institutional profile URL</span><input type="url" required value={form.facultyUrl} onChange={(event) => setForm({ ...form, facultyUrl: event.target.value })} placeholder="https://university.edu/faculty/name" /></label>
          <label className="form-span"><span>Course context <small>Optional</small></span><textarea value={form.courseContext} onChange={(event) => setForm({ ...form, courseContext: event.target.value })} rows={4} placeholder="Course title, expected term, level, or planned use of the book" /></label>
        </div>
        <button className="button button-primary" type="submit" disabled={submitting || personalEmailBlocked}><Send aria-hidden="true" size={17} /> {submitting ? 'Submitting…' : application ? 'Resubmit for review' : 'Submit for review'}</button>
        <p className="form-privacy">Submitting this form acknowledges the <a href="/privacy">privacy notice</a> and confirms that the information is accurate.</p>
        {notice && <p className="form-message form-success" role="status">{notice}</p>}
        {error && <p className="form-message form-error" role="alert">{error}</p>}
      </form>

      <aside className="application-status">
        {application?.status === 'pending' ? <><Clock3 aria-hidden="true" size={25} /><p className="eyebrow">Review pending</p><h2>Your application is in the review queue.</h2><p>You may update the form while it is pending. Resubmitting replaces the pending information.</p></> : application?.status === 'rejected' ? <><ShieldAlert aria-hidden="true" size={25} /><p className="eyebrow">More information needed</p><h2>The application was not approved.</h2><p>{application.decision_note || 'Review the information and submit an updated application.'}</p></> : <><GraduationCap aria-hidden="true" size={25} /><p className="eyebrow">Verification</p><h2>Institutional email plus human review.</h2><p>We verify the institution, teaching position, and public faculty or staff profile before granting access.</p></>}
        <a className="text-link" href="/teach">Review teaching resources <ExternalLink aria-hidden="true" size={16} /></a>
      </aside>
    </div>
  );
}
