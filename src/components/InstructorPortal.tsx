import { CheckCircle2, Clock3, Download, ExternalLink, GraduationCap, LockKeyhole, Send, ShieldAlert } from 'lucide-react';
import { type SubmitEvent, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
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
      setResources([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const { data, error: applicationError } = await supabase
      .from('instructor_applications')
      .select('id,email,institution,department,position_title,faculty_url,course_context,status,decision_note,updated_at')
      .eq('user_id', activeSession.user.id)
      .maybeSingle();

    if (applicationError) {
      setError(applicationError.message);
      setLoading(false);
      return;
    }

    const currentApplication = data as Application | null;
    setApplication(currentApplication);
    if (currentApplication) {
      setForm({
        institution: currentApplication.institution,
        department: currentApplication.department,
        positionTitle: currentApplication.position_title,
        facultyUrl: currentApplication.faculty_url,
        courseContext: currentApplication.course_context ?? '',
      });
    }

    const currentEmail = activeSession.user.email?.toLowerCase();
    if (currentApplication?.status === 'approved' && currentApplication.email.toLowerCase() === currentEmail) {
      const { data: resourceData, error: resourceError } = await supabase
        .from('instructor_resources')
        .select('id,title,description,category,storage_path')
        .eq('published', true)
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

    setSubmitting(true);
    setError('');
    setNotice('');
    const { error: submitError } = await supabase.rpc('submit_instructor_application', {
      p_institution: form.institution.trim(),
      p_department: form.department.trim(),
      p_position_title: form.positionTitle,
      p_faculty_url: form.facultyUrl.trim(),
      p_course_context: form.courseContext.trim() || null,
    });
    setSubmitting(false);

    if (submitError) {
      setError(submitError.message);
      return;
    }
    setNotice('Your application was submitted for review.');
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
    return <div className="account-state"><GraduationCap aria-hidden="true" size={28} /><div><h2>Sign in to request instructor access.</h2><p>Use the email address associated with your institution. Email verification is required before an application can be submitted.</p><a className="button button-primary" href="/account?next=/instructor">Sign in or create an account</a></div></div>;
  }

  if (application?.status === 'approved' && application.email.toLowerCase() !== session.user.email?.toLowerCase()) {
    return <div className="account-state account-unconfigured"><ShieldAlert aria-hidden="true" size={28} /><div><h2>Your approved email no longer matches this account.</h2><p>Protected access has been paused. Sign in with the originally approved institutional address or contact the portal administrator for a new review.</p></div></div>;
  }

  if (application?.status === 'approved') {
    return (
      <div className="instructor-approved">
        <div className="access-status access-approved"><CheckCircle2 aria-hidden="true" size={24} /><div><p className="eyebrow">Approved instructor</p><h2>Protected teaching resources</h2><p>Signed downloads expire after 60 seconds and require your approved account.</p></div></div>
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

  return (
    <div className="instructor-application-grid">
      <form className="instructor-form" onSubmit={submitApplication}>
        <p className="eyebrow">Instructor application</p>
        <h2>{application ? 'Update and resubmit your information.' : 'Tell us about your teaching role.'}</h2>
        <p className="verified-email"><CheckCircle2 aria-hidden="true" size={17} /> Verified email: <strong>{session.user.email}</strong></p>
        <div className="form-grid">
          <label><span>Institution</span><input required value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} autoComplete="organization" /></label>
          <label><span>Department</span><input required value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label>
          <label><span>Position</span><select required value={form.positionTitle} onChange={(event) => setForm({ ...form, positionTitle: event.target.value })}><option value="">Select a position</option><option>Professor</option><option>Associate Professor</option><option>Assistant Professor</option><option>Lecturer</option><option>Instructor</option><option>Adjunct Faculty</option><option>Teaching Assistant</option><option>Other teaching role</option></select></label>
          <label><span>Institutional profile URL</span><input type="url" required value={form.facultyUrl} onChange={(event) => setForm({ ...form, facultyUrl: event.target.value })} placeholder="https://university.edu/faculty/name" /></label>
          <label className="form-span"><span>Course context <small>Optional</small></span><textarea value={form.courseContext} onChange={(event) => setForm({ ...form, courseContext: event.target.value })} rows={4} placeholder="Course title, expected term, level, or planned use of the book" /></label>
        </div>
        <button className="button button-primary" type="submit" disabled={submitting}><Send aria-hidden="true" size={17} /> {submitting ? 'Submitting…' : application ? 'Resubmit for review' : 'Submit for review'}</button>
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
