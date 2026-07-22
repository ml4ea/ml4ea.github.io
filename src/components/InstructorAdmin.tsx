import { Check, Mail, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

interface ReviewApplication {
  id: string;
  email: string;
  institution: string;
  department: string;
  position_title: string;
  faculty_url: string;
  course_context: string | null;
  status: 'pending' | 'approved' | 'rejected';
  decision_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export default function InstructorAdmin() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [applications, setApplications] = useState<ReviewApplication[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadApplications = async (activeSession: Session | null) => {
    const supabase = getSupabaseClient();
    if (!supabase || !activeSession) {
      setLoading(false);
      return;
    }

    const { data: adminRecord } = await supabase.from('portal_admins').select('user_id').eq('user_id', activeSession.user.id).maybeSingle();
    if (!adminRecord) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    setIsAdmin(true);
    const { data, error: listError } = await supabase
      .from('instructor_applications')
      .select('id,email,institution,department,position_title,faculty_url,course_context,status,decision_note,reviewed_at,created_at')
      .order('created_at', { ascending: true });
    if (listError) setError(listError.message);
    const nextApplications = (data ?? []) as ReviewApplication[];
    setApplications(nextApplications);
    setNotes(Object.fromEntries(nextApplications.map((application) => [application.id, application.decision_note ?? ''])));
    setLoading(false);
  };

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      void loadApplications(data.session);
    });
  }, []);

  const sendDecisionNotification = async (id: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    setNotifyingId(id);
    const { error: notificationError } = await supabase.functions.invoke('notify-instructor-decision', {
      body: { applicationId: id },
    });
    setNotifyingId(null);
    return !notificationError;
  };

  const review = async (id: string, status: 'approved' | 'rejected') => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setReviewingId(id);
    setNotice('');
    setError('');
    const { error: reviewError } = await supabase.rpc('review_instructor_application', {
      p_application_id: id,
      p_status: status,
      p_decision_note: notes[id]?.trim() || null,
    });
    if (reviewError) {
      setError(reviewError.message);
      setReviewingId(null);
      return;
    }
    await loadApplications(session);
    setReviewingId(null);
    setNotice(`Application ${status}.`);
    const notified = await sendDecisionNotification(id);
    if (notified) setNotice(`Application ${status}; notification email sent.`);
    else setError(`Application ${status}, but the notification email could not be sent.`);
  };

  const resendNotification = async (id: string) => {
    setNotice('');
    setError('');
    const notified = await sendDecisionNotification(id);
    if (notified) setNotice('Decision notification email sent.');
    else setError('The notification email could not be sent. The review decision is unchanged.');
  };

  if (!isSupabaseConfigured) return <p className="account-loading">Supabase is not configured.</p>;
  if (loading) return <p className="account-loading">Checking administrator access…</p>;
  if (!session) return <div className="account-state"><ShieldCheck aria-hidden="true" size={28} /><div><h2>Administrator sign-in required.</h2><p>Sign in from this browser to continue directly to instructor reviews.</p><a className="button button-primary" href="/account?next=/admin/instructors/">Sign in</a></div></div>;
  if (!isAdmin) return <div className="account-state"><ShieldCheck aria-hidden="true" size={28} /><div><h2>This account is not a portal administrator.</h2><p>Administrator status is assigned directly in the protected database.</p></div></div>;

  return (
    <div className="admin-review">
      <div className="catalog-status"><p>{applications.length} {applications.length === 1 ? 'application' : 'applications'}</p><a className="text-link" href="/admin/">Administrator dashboard</a></div>
      {notice && <p className="form-message form-success" role="status">{notice}</p>}
      {applications.length === 0 ? <p>No instructor applications have been submitted.</p> : (
        <ol>
          {applications.map((application) => (
            <li key={application.id}>
              <article>
                <div className="admin-application-copy">
                  <div className="result-meta"><span>{application.status}</span><span>{new Date(application.created_at).toLocaleDateString()}</span></div>
                  <h2>{application.email}</h2>
                  <p><strong>{application.position_title}</strong> · {application.department}, {application.institution}</p>
                  {application.course_context && <p>{application.course_context}</p>}
                  <a className="text-link" href={application.faculty_url} target="_blank" rel="noreferrer">Verify institutional profile</a>
                </div>
                <div className="admin-review-controls">
                  <label><span>Decision note</span><textarea rows={3} value={notes[application.id] ?? ''} readOnly={application.status !== 'pending'} onChange={(event) => setNotes({ ...notes, [application.id]: event.target.value })} /></label>
                  <div>
                    <button className="button button-primary" type="button" disabled={reviewingId === application.id || application.status !== 'pending'} onClick={() => review(application.id, 'approved')}><Check aria-hidden="true" size={17} /> {reviewingId === application.id ? 'Saving…' : application.status === 'approved' ? 'Approved' : 'Approve'}</button>
                    <button className="button button-secondary" type="button" disabled={reviewingId === application.id || application.status !== 'pending'} onClick={() => review(application.id, 'rejected')}><X aria-hidden="true" size={17} /> {reviewingId === application.id ? 'Saving…' : application.status === 'rejected' ? 'Rejected' : 'Reject'}</button>
                    {application.status !== 'pending' && <button className="button button-secondary" type="button" disabled={notifyingId === application.id} onClick={() => resendNotification(application.id)}><Mail aria-hidden="true" size={17} /> {notifyingId === application.id ? 'Sending…' : 'Email decision'}</button>}
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}
      {error && <p className="form-message form-error" role="alert">{error}</p>}
    </div>
  );
}
