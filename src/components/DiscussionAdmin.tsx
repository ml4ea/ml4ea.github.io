import { Check, ExternalLink, EyeOff, LockKeyhole, MessageSquareWarning, ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

interface Report {
  id: string;
  thread_id: string | null;
  reply_id: string | null;
  reason: string;
  details: string | null;
  status: 'open' | 'resolved' | 'dismissed';
  created_at: string;
}

interface ThreadTarget { id: string; title: string; body: string; author_name: string; status: string }
interface ReplyTarget { id: string; thread_id: string; body: string; author_name: string; status: string }

const excerpt = (value: string) => value.length > 420 ? `${value.slice(0, 417).trimEnd()}...` : value;
const labelReason = (value: string) => value.replaceAll('-', ' ').replace(/^./, (character) => character.toUpperCase());

export default function DiscussionAdmin() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [threads, setThreads] = useState<ThreadTarget[]>([]);
  const [replies, setReplies] = useState<ReplyTarget[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [actingId, setActingId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadReports = async (activeSession: Session | null) => {
    const supabase = getSupabaseClient();
    setSession(activeSession);
    setReports([]); setThreads([]); setReplies([]);
    if (!supabase || !activeSession) { setIsAdmin(false); setLoading(false); return; }
    setLoading(true); setError('');
    const { data: admin, error: adminError } = await supabase.rpc('is_portal_admin');
    if (adminError || !admin) { setIsAdmin(false); setError(adminError?.message ?? 'Administrator access is required.'); setLoading(false); return; }
    setIsAdmin(true);
    const { data: reportData, error: reportError } = await supabase.from('discussion_reports').select('id,thread_id,reply_id,reason,details,status,created_at').order('created_at', { ascending: false });
    const nextReports = (reportData ?? []) as Report[];
    const threadIds = [...new Set(nextReports.flatMap((report) => report.thread_id ? [report.thread_id] : []))];
    const replyIds = [...new Set(nextReports.flatMap((report) => report.reply_id ? [report.reply_id] : []))];
    const [threadResult, replyResult] = await Promise.all([
      threadIds.length ? supabase.from('discussion_threads').select('id,title,body,author_name,status').in('id', threadIds) : Promise.resolve({ data: [], error: null }),
      replyIds.length ? supabase.from('discussion_replies').select('id,thread_id,body,author_name,status').in('id', replyIds) : Promise.resolve({ data: [], error: null }),
    ]);
    setReports(nextReports);
    setThreads((threadResult.data ?? []) as ThreadTarget[]);
    setReplies((replyResult.data ?? []) as ReplyTarget[]);
    setError(reportError?.message ?? threadResult.error?.message ?? replyResult.error?.message ?? '');
    setLoading(false);
  };

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => void loadReports(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => window.setTimeout(() => void loadReports(nextSession), 0));
    return () => listener.subscription.unsubscribe();
  }, []);

  const threadById = useMemo(() => new Map(threads.map((thread) => [thread.id, thread])), [threads]);
  const replyById = useMemo(() => new Map(replies.map((reply) => [reply.id, reply])), [replies]);

  const decide = async (report: Report, decision: 'resolved' | 'dismissed', hideContent = false) => {
    const supabase = getSupabaseClient();
    if (!supabase || !session) return;
    setActingId(report.id); setNotice(''); setError('');
    if (hideContent) {
      const contentResult = report.thread_id
        ? await supabase.from('discussion_threads').update({ status: 'hidden' }).eq('id', report.thread_id)
        : await supabase.from('discussion_replies').update({ status: 'hidden' }).eq('id', report.reply_id!);
      if (contentResult.error) { setError(contentResult.error.message); setActingId(''); return; }
    }
    const { error: updateError } = await supabase.from('discussion_reports').update({ status: decision, reviewed_by: session.user.id, reviewed_at: new Date().toISOString() }).eq('id', report.id);
    if (updateError) { setError(updateError.message); setActingId(''); return; }
    setNotice(hideContent ? 'Content hidden and report resolved.' : decision === 'dismissed' ? 'Report dismissed.' : 'Report resolved.');
    setActingId('');
    await loadReports(session);
  };

  if (!isSupabaseConfigured) return <p className="account-loading">Supabase is not configured.</p>;
  if (loading) return <p className="account-loading" aria-live="polite">Checking discussion reports...</p>;
  if (!session) return <div className="account-state"><ShieldCheck aria-hidden="true" size={28} /><div><h2>Administrator sign-in required.</h2><p>Sign in with the portal administrator account to review reports.</p><a className="button button-primary" href="/account?next=/admin/discussions/">Sign in</a></div></div>;
  if (!isAdmin) return <div className="account-state"><LockKeyhole aria-hidden="true" size={28} /><div><h2>This account is not the portal administrator.</h2><p>Discussion moderation is restricted to the verified administrator account.</p></div></div>;

  const openReports = reports.filter((report) => report.status === 'open');
  return <div className="discussion-admin">
    <div className="catalog-status"><p>{openReports.length} open {openReports.length === 1 ? 'report' : 'reports'}</p><a className="text-link" href="/admin/">Administrator dashboard</a></div>
    {notice && <p className="form-message form-success" role="status">{notice}</p>}
    {openReports.length === 0 ? <div className="admin-empty"><Check aria-hidden="true" size={25} /><div><h2>No discussion reports need attention.</h2><p>New participant reports will appear here.</p></div></div> : <ol>
      {openReports.map((report) => {
        const reply = report.reply_id ? replyById.get(report.reply_id) : null;
        const thread = report.thread_id ? threadById.get(report.thread_id) : reply ? threadById.get(reply.thread_id) : null;
        const body = report.thread_id ? thread?.body : reply?.body;
        const author = report.thread_id ? thread?.author_name : reply?.author_name;
        const threadId = report.thread_id ?? reply?.thread_id;
        return <li key={report.id}><article>
          <div className="discussion-report-copy"><div className="result-meta"><span>{labelReason(report.reason)}</span><span>{new Date(report.created_at).toLocaleDateString()}</span></div><h2>{report.thread_id ? thread?.title ?? 'Reported discussion' : 'Reported reply'}</h2><p className="discussion-report-author">By {author ?? 'Unknown participant'}</p><p>{body ? excerpt(body) : 'The reported content is no longer available.'}</p>{report.details && <blockquote>{report.details}</blockquote>}{threadId && <a className="text-link" href={`/community/?thread=${threadId}`} target="_blank" rel="noreferrer">Open discussion <ExternalLink aria-hidden="true" size={15} /></a>}</div>
          <div className="discussion-report-actions"><button className="button button-primary" type="button" disabled={actingId === report.id} onClick={() => void decide(report, 'resolved', true)}><EyeOff aria-hidden="true" size={16} /> Hide and resolve</button><button className="button button-secondary" type="button" disabled={actingId === report.id} onClick={() => void decide(report, 'dismissed')}><X aria-hidden="true" size={16} /> Dismiss report</button></div>
        </article></li>;
      })}
    </ol>}
    {error && <p className="form-message form-error" role="alert"><MessageSquareWarning aria-hidden="true" size={17} /> {error}</p>}
  </div>;
}
