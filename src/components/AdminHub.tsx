import { BellRing, CheckCircle2, ExternalLink, GraduationCap, KeyRound, LockKeyhole, Megaphone, MessageSquareWarning, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

interface TaskCounts {
  instructorRequests: number;
  discussionReports: number;
}

const emptyCounts: TaskCounts = { instructorRequests: 0, discussionReports: 0 };

export default function AdminHub() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [counts, setCounts] = useState(emptyCounts);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const loadDashboard = async (activeSession: Session | null) => {
      setSession(activeSession);
      setCounts(emptyCounts);
      if (!activeSession) { setIsAdmin(false); setIsOwner(false); setLoading(false); return; }
      setLoading(true);
      setError('');
      const [{ data: admin, error: adminError }, { data: owner }] = await Promise.all([
        supabase.rpc('is_portal_admin'),
        supabase.rpc('is_portal_owner'),
      ]);
      if (adminError || !admin) {
        setIsAdmin(false);
        setIsOwner(false);
        setError(adminError?.message ?? 'Administrator access is required.');
        setLoading(false);
        return;
      }
      setIsAdmin(true);
      setIsOwner(Boolean(owner));
      const [applications, reports] = await Promise.all([
        supabase.from('instructor_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('discussion_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      ]);
      setCounts({ instructorRequests: applications.count ?? 0, discussionReports: reports.count ?? 0 });
      setError(applications.error?.message ?? reports.error?.message ?? '');
      setLoading(false);
    };
    supabase.auth.getSession().then(({ data }) => void loadDashboard(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => window.setTimeout(() => void loadDashboard(nextSession), 0));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) return <div className="account-state"><LockKeyhole aria-hidden="true" size={28} /><div><h2>Administration is being connected.</h2><p>The dashboard will appear after the account service is configured.</p></div></div>;
  if (loading) return <p className="account-loading" aria-live="polite">Checking administrator tasks...</p>;
  if (!session) return <div className="account-state"><ShieldCheck aria-hidden="true" size={28} /><div><h2>Administrator sign-in required.</h2><p>Sign in with the owner or delegated administrator account to continue.</p><a className="button button-primary" href="/account?next=/admin/">Sign in</a></div></div>;
  if (!isAdmin) return <div className="account-state account-unconfigured"><LockKeyhole aria-hidden="true" size={28} /><div><h2>This account is not a portal administrator.</h2><p>ML4EA administration is restricted to verified owner and delegated administrator accounts.</p>{error && <p className="form-message form-error" role="alert">{error}</p>}</div></div>;

  const totalPending = counts.instructorRequests + counts.discussionReports;
  return <div className="admin-hub">
    <section className="admin-task-summary" aria-labelledby="admin-task-heading">
      <BellRing aria-hidden="true" size={26} />
      <div><p className="eyebrow">Pending work</p><h2 id="admin-task-heading">{totalPending === 0 ? 'No tasks need attention.' : `${totalPending} ${totalPending === 1 ? 'task needs' : 'tasks need'} attention.`}</h2><p>Counts update whenever this page opens.</p></div>
      {totalPending === 0 && <CheckCircle2 aria-hidden="true" size={28} />}
    </section>

    <section className="admin-task-grid" aria-label="Pending administrator tasks">
      <a href="/admin/instructors/"><GraduationCap aria-hidden="true" size={25} /><div><span>{counts.instructorRequests}</span><p className="eyebrow">Instructor access</p><h3>Review requests</h3><p>Verify institutional identity and teaching role, then approve or reject each request.</p><strong>Open reviews <ExternalLink aria-hidden="true" size={15} /></strong></div></a>
      <a href="/admin/discussions/"><MessageSquareWarning aria-hidden="true" size={25} /><div><span>{counts.discussionReports}</span><p className="eyebrow">Community moderation</p><h3>Review discussion reports</h3><p>Inspect reported threads and replies, dismiss reports, or hide content that requires intervention.</p><strong>Open reports <ExternalLink aria-hidden="true" size={15} /></strong></div></a>
    </section>

    <section className="admin-tools" aria-labelledby="admin-tools-heading">
      <div><p className="eyebrow">Administrator pages</p><h2 id="admin-tools-heading">Portal management shortcuts.</h2></div>
      <nav aria-label="Administrator pages">
        <a href="/admin/instructors/"><GraduationCap aria-hidden="true" size={19} /><span><strong>Instructor Reviews</strong><small>Access decisions and decision emails</small></span><ExternalLink aria-hidden="true" size={15} /></a>
        <a href="/admin/discussions/"><MessageSquareWarning aria-hidden="true" size={19} /><span><strong>Discussion Moderation</strong><small>Reports and content review</small></span><ExternalLink aria-hidden="true" size={15} /></a>
        <a href="/community/?category=announcements"><Megaphone aria-hidden="true" size={19} /><span><strong>Portal Announcements</strong><small>Publish community notices as administrator</small></span><ExternalLink aria-hidden="true" size={15} /></a>
        {isOwner && <a href="/admin/delegation/"><KeyRound aria-hidden="true" size={19} /><span><strong>Administrator Delegation</strong><small>Appoint or revoke one alternate administrator</small></span><ExternalLink aria-hidden="true" size={15} /></a>}
      </nav>
    </section>

    {error && <p className="form-message form-error" role="alert">{error}</p>}
  </div>;
}
