import {
  ArrowLeft,
  CheckCircle2,
  Flag,
  LockKeyhole,
  MessageSquareText,
  MessagesSquare,
  Plus,
  Reply,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { type SubmitEvent, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  visibility: 'public' | 'instructors';
  posting_enabled: boolean;
  sort_order: number;
}

interface Thread {
  id: string;
  category_id: string;
  author_name: string;
  title: string;
  body: string;
  chapter_number: number | null;
  ae_number: string | null;
  status: 'open' | 'locked';
  pinned: boolean;
  reply_count: number;
  last_activity_at: string;
  created_at: string;
}

interface DiscussionReply {
  id: string;
  thread_id: string;
  author_name: string;
  body: string;
  helpful: boolean;
  created_at: string;
}

type ReportTarget = { threadId: string | null; replyId: string | null };

const emptyThreadForm = {
  displayName: '',
  categorySlug: 'learning-the-book',
  title: '',
  body: '',
  chapter: '',
  aeNumber: '',
};

const formatDate = (value: string) => new Intl.DateTimeFormat('en', {
  month: 'short', day: 'numeric', year: new Date(value).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
}).format(new Date(value));

const excerpt = (value: string) => value.length > 230 ? `${value.slice(0, 227).trimEnd()}...` : value;

export default function DiscussionBoard() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [replies, setReplies] = useState<DiscussionReply[]>([]);
  const [threadForm, setThreadForm] = useState(emptyThreadForm);
  const [replyBody, setReplyBody] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportReason, setReportReason] = useState('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadCategories = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error: categoryError } = await supabase
      .from('discussion_categories')
      .select('id,slug,name,description,visibility,posting_enabled,sort_order')
      .order('sort_order');
    if (categoryError) { setError(categoryError.message); return; }
    const availableCategories = (data ?? []) as Category[];
    setCategories(availableCategories);
    const requestedCategory = new URLSearchParams(window.location.search).get('category');
    setSelectedCategory(requestedCategory && availableCategories.some((category) => category.slug === requestedCategory) ? requestedCategory : 'all');
  };

  const loadThreads = async (categorySlug = selectedCategory) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoading(true);
    setError('');
    let request = supabase
      .from('discussion_threads')
      .select('id,category_id,author_name,title,body,chapter_number,ae_number,status,pinned,reply_count,last_activity_at,created_at')
      .order('pinned', { ascending: false })
      .order('last_activity_at', { ascending: false })
      .limit(60);
    const category = categories.find((item) => item.slug === categorySlug);
    if (category) request = request.eq('category_id', category.id);
    const { data, error: threadError } = await request;
    setLoading(false);
    if (threadError) { setError(threadError.message); return; }
    setThreads((data ?? []) as Thread[]);
  };

  const loadThread = async (threadId: string | null) => {
    const supabase = getSupabaseClient();
    if (!supabase || !threadId) { setSelectedThread(null); setReplies([]); return; }
    setLoading(true);
    setError('');
    const [{ data: threadData, error: threadError }, { data: replyData, error: replyError }] = await Promise.all([
      supabase.from('discussion_threads').select('id,category_id,author_name,title,body,chapter_number,ae_number,status,pinned,reply_count,last_activity_at,created_at').eq('id', threadId).single(),
      supabase.from('discussion_replies').select('id,thread_id,author_name,body,helpful,created_at').eq('thread_id', threadId).order('created_at'),
    ]);
    setLoading(false);
    if (threadError || replyError) { setError(threadError?.message ?? replyError?.message ?? 'Discussion could not be loaded.'); return; }
    setSelectedThread(threadData as Thread);
    setReplies((replyData ?? []) as DiscussionReply[]);
  };

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const initialize = async (activeSession: Session | null) => {
      setSession(activeSession);
      if (activeSession) {
        const [{ data: profile }, { data: admin }] = await Promise.all([
          supabase.from('profiles').select('display_name').eq('user_id', activeSession.user.id).maybeSingle(),
          supabase.rpc('is_portal_admin'),
        ]);
        const displayName = (profile as { display_name: string | null } | null)?.display_name ?? '';
        setThreadForm((current) => ({ ...current, displayName }));
        setIsAdmin(Boolean(admin));
      } else {
        setIsAdmin(false);
      }
      await loadCategories();
    };
    supabase.auth.getSession().then(({ data }) => void initialize(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => window.setTimeout(() => void initialize(nextSession), 0));
    const onPopState = () => {
      const parameters = new URLSearchParams(window.location.search);
      setSelectedCategory(parameters.get('category') ?? 'all');
      void loadThread(parameters.get('thread'));
    };
    window.addEventListener('popstate', onPopState);
    return () => { listener.subscription.unsubscribe(); window.removeEventListener('popstate', onPopState); };
  }, []);

  useEffect(() => {
    if (categories.length === 0) return;
    const threadId = new URLSearchParams(window.location.search).get('thread');
    if (threadId) void loadThread(threadId);
    else void loadThreads(selectedCategory);
  }, [categories, selectedCategory]);

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const postableCategories = categories.filter((category) => category.posting_enabled || isAdmin);

  const chooseCategory = (slug: string) => {
    const url = new URL(window.location.href);
    url.searchParams.delete('thread');
    if (slug === 'all') url.searchParams.delete('category');
    else url.searchParams.set('category', slug);
    window.history.pushState({}, '', url);
    setSelectedThread(null);
    setReplies([]);
    setSelectedCategory(slug);
  };

  const openThread = (thread: Thread) => {
    const url = new URL(window.location.href);
    url.searchParams.set('thread', thread.id);
    window.history.pushState({}, '', url);
    void loadThread(thread.id);
    window.scrollTo({ top: document.querySelector('.discussion-board')?.getBoundingClientRect().top ?? 0, behavior: 'smooth' });
  };

  const closeThread = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('thread');
    window.history.pushState({}, '', url);
    setSelectedThread(null);
    setReplies([]);
    void loadThreads(selectedCategory);
  };

  const submitThread = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSubmitting(true); setError(''); setNotice('');
    const { data, error: submitError } = await supabase.rpc('create_discussion_thread', {
      p_category_slug: threadForm.categorySlug,
      p_title: threadForm.title,
      p_body: threadForm.body,
      p_display_name: threadForm.displayName,
      p_chapter_number: threadForm.chapter ? Number(threadForm.chapter) : null,
      p_ae_number: threadForm.aeNumber || null,
    });
    setSubmitting(false);
    if (submitError) { setError(submitError.message); return; }
    setThreadForm((current) => ({ ...emptyThreadForm, displayName: current.displayName, categorySlug: current.categorySlug }));
    setComposerOpen(false);
    setNotice('Your discussion is now open.');
    await loadThreads(selectedCategory);
    if (data) {
      const url = new URL(window.location.href); url.searchParams.set('thread', String(data)); window.history.pushState({}, '', url);
      await loadThread(String(data));
    }
  };

  const submitReply = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase || !selectedThread) return;
    setSubmitting(true); setError(''); setNotice('');
    const { error: submitError } = await supabase.rpc('create_discussion_reply', {
      p_thread_id: selectedThread.id,
      p_body: replyBody,
      p_display_name: threadForm.displayName,
    });
    setSubmitting(false);
    if (submitError) { setError(submitError.message); return; }
    setReplyBody('');
    setNotice('Your reply was posted.');
    await loadThread(selectedThread.id);
  };

  const submitReport = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase || !reportTarget) return;
    setSubmitting(true); setError(''); setNotice('');
    const { error: reportError } = await supabase.rpc('report_discussion_item', {
      p_thread_id: reportTarget.threadId,
      p_reply_id: reportTarget.replyId,
      p_reason: reportReason,
      p_details: reportDetails || null,
    });
    setSubmitting(false);
    if (reportError) { setError(reportError.message); return; }
    setReportTarget(null); setReportDetails('');
    setNotice('Thank you. The report was sent for review.');
  };

  if (!isSupabaseConfigured) return <div className="account-state"><MessagesSquare aria-hidden="true" size={28} /><div><h2>Discussions are being connected.</h2><p>The community board will appear after its secure data service is configured.</p></div></div>;

  return (
    <div className="discussion-board">
      {selectedThread ? (
        <div className="discussion-thread-view">
          <button className="discussion-back" type="button" onClick={closeThread}><ArrowLeft aria-hidden="true" size={17} /> All discussions</button>
          <article className="discussion-original-post">
            <div className="discussion-post-meta"><span>{categoryById.get(selectedThread.category_id)?.name}</span>{selectedThread.pinned && <strong>Pinned</strong>}{selectedThread.status === 'locked' && <strong><LockKeyhole aria-hidden="true" size={13} /> Locked</strong>}</div>
            <h2>{selectedThread.title}</h2>
            <div className="discussion-tags">{selectedThread.chapter_number && <span>Chapter {selectedThread.chapter_number}</span>}{selectedThread.ae_number && <span>AE {selectedThread.ae_number}</span>}</div>
            <p className="discussion-body">{selectedThread.body}</p>
            <footer><span>Started by <strong>{selectedThread.author_name}</strong> on {formatDate(selectedThread.created_at)}</span>{session && <button type="button" onClick={() => setReportTarget({ threadId: selectedThread.id, replyId: null })}><Flag aria-hidden="true" size={14} /> Report</button>}</footer>
          </article>

          <section className="discussion-replies" aria-labelledby="discussion-replies-heading">
            <div className="discussion-replies-heading"><h3 id="discussion-replies-heading">{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</h3></div>
            {replies.map((reply) => <article key={reply.id}><header><strong>{reply.author_name}</strong><span>{formatDate(reply.created_at)}</span>{reply.helpful && <em><CheckCircle2 aria-hidden="true" size={14} /> Helpful</em>}</header><p className="discussion-body">{reply.body}</p>{session && <button type="button" onClick={() => setReportTarget({ threadId: null, replyId: reply.id })}><Flag aria-hidden="true" size={14} /> Report</button>}</article>)}
          </section>

          {selectedThread.status === 'open' ? session ? (
            <form className="discussion-reply-form" onSubmit={submitReply}>
              <Reply aria-hidden="true" size={22} /><div><label htmlFor="discussion-reply">Add a reply</label><textarea id="discussion-reply" required minLength={2} maxLength={10000} rows={5} value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder="Add evidence, reasoning, a question, or a constructive response." /><button className="button button-primary" type="submit" disabled={submitting}><Send aria-hidden="true" size={16} /> {submitting ? 'Posting…' : 'Post reply'}</button></div>
            </form>
          ) : <div className="discussion-signin-callout"><MessageSquareText aria-hidden="true" size={22} /><div><strong>Join the conversation.</strong><p>Sign in with a verified email address to reply.</p></div><a className="button button-primary" href={`/account?next=${encodeURIComponent(`/community?thread=${selectedThread.id}`)}`}>Sign in</a></div> : <p className="discussion-locked-note"><LockKeyhole aria-hidden="true" size={18} /> This discussion is closed to new replies.</p>}
        </div>
      ) : (
        <>
          <div className="discussion-board-toolbar">
            <div><p className="eyebrow">Discussion board</p><h2>Questions, reasoning, and experience.</h2><p>Use discussions for conversation. Use Contributions when proposing a correction or reusable resource for review.</p></div>
            {session ? <button className="button button-primary" type="button" onClick={() => setComposerOpen(!composerOpen)}>{composerOpen ? <X aria-hidden="true" size={17} /> : <Plus aria-hidden="true" size={17} />}{composerOpen ? 'Close' : 'Start a discussion'}</button> : <a className="button button-primary" href="/account?next=/community"><MessageSquareText aria-hidden="true" size={17} /> Sign in to post</a>}
          </div>

          {composerOpen && session && <form className="discussion-composer" onSubmit={submitThread}>
            <div className="discussion-composer-heading"><MessageSquareText aria-hidden="true" size={23} /><div><p className="eyebrow">New discussion</p><h3>Give others enough context to respond.</h3></div></div>
            <div className="form-grid">
              <label><span>Display name</span><input required minLength={2} maxLength={60} value={threadForm.displayName} onChange={(event) => setThreadForm({ ...threadForm, displayName: event.target.value })} /></label>
              <label><span>Category</span><select required value={threadForm.categorySlug} onChange={(event) => setThreadForm({ ...threadForm, categorySlug: event.target.value })}>{postableCategories.map((category) => <option key={category.id} value={category.slug}>{category.name}{category.visibility === 'instructors' ? ' (instructors)' : ''}</option>)}</select></label>
              <label className="form-span"><span>Title</span><input required minLength={8} maxLength={180} value={threadForm.title} onChange={(event) => setThreadForm({ ...threadForm, title: event.target.value })} placeholder="What would you like to examine or ask?" /></label>
              <label><span>Book chapter <small>Optional</small></span><select value={threadForm.chapter} onChange={(event) => setThreadForm({ ...threadForm, chapter: event.target.value })}><option value="">No chapter tag</option>{Array.from({ length: 15 }, (_, index) => <option key={index + 1} value={index + 1}>Chapter {index + 1}</option>)}</select></label>
              <label><span>AE number <small>Optional</small></span><input maxLength={20} value={threadForm.aeNumber} onChange={(event) => setThreadForm({ ...threadForm, aeNumber: event.target.value })} placeholder="For example, 10.3.2" /></label>
              <label className="form-span"><span>Discussion</span><textarea required minLength={20} maxLength={10000} rows={7} value={threadForm.body} onChange={(event) => setThreadForm({ ...threadForm, body: event.target.value })} placeholder="Explain the context, your reasoning, what you tried, and what kind of response would help." /></label>
            </div>
            <button className="button button-primary" type="submit" disabled={submitting}><Send aria-hidden="true" size={16} /> {submitting ? 'Publishing…' : 'Publish discussion'}</button>
          </form>}

          <div className="discussion-category-tabs" role="tablist" aria-label="Discussion categories">
            <button type="button" role="tab" aria-selected={selectedCategory === 'all'} className={selectedCategory === 'all' ? 'is-active' : ''} onClick={() => chooseCategory('all')}>All discussions</button>
            {categories.map((category) => <button key={category.id} type="button" role="tab" aria-selected={selectedCategory === category.slug} className={selectedCategory === category.slug ? 'is-active' : ''} onClick={() => chooseCategory(category.slug)}>{category.visibility === 'instructors' && <LockKeyhole aria-hidden="true" size={14} />}{category.name}</button>)}
          </div>

          {loading ? <p className="account-loading" aria-live="polite">Loading discussions…</p> : threads.length > 0 ? <div className="discussion-thread-list">{threads.map((thread) => {
            const category = categoryById.get(thread.category_id);
            return <button key={thread.id} type="button" onClick={() => openThread(thread)}><div className="discussion-thread-copy"><div className="discussion-post-meta"><span>{category?.name}</span>{category?.visibility === 'instructors' && <strong><LockKeyhole aria-hidden="true" size={13} /> Instructors</strong>}{thread.pinned && <strong>Pinned</strong>}</div><h3>{thread.title}</h3><p>{excerpt(thread.body)}</p><div className="discussion-tags">{thread.chapter_number && <span>Chapter {thread.chapter_number}</span>}{thread.ae_number && <span>AE {thread.ae_number}</span>}</div></div><div className="discussion-thread-stats"><strong>{thread.reply_count}</strong><span>{thread.reply_count === 1 ? 'reply' : 'replies'}</span><small>{formatDate(thread.last_activity_at)}</small></div></button>;
          })}</div> : <div className="discussion-empty"><MessagesSquare aria-hidden="true" size={30} /><h3>No discussions here yet.</h3><p>Start with a focused question, an engineering interpretation, or an experience others can learn from.</p>{session && <button className="button button-primary" type="button" onClick={() => setComposerOpen(true)}><Plus aria-hidden="true" size={16} /> Start the first discussion</button>}</div>}
        </>
      )}

      {reportTarget && <form className="discussion-report" onSubmit={submitReport}><div className="discussion-report-heading"><Flag aria-hidden="true" size={21} /><div><p className="eyebrow">Moderation report</p><h3>Tell us what needs review.</h3></div><button type="button" aria-label="Close report form" onClick={() => setReportTarget(null)}><X aria-hidden="true" size={18} /></button></div><label><span>Reason</span><select value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option value="spam">Spam</option><option value="harassment">Harassment or abuse</option><option value="privacy">Private or sensitive information</option><option value="copyright">Copyright concern</option><option value="incorrect-category">Incorrect category</option><option value="other">Other</option></select></label><label><span>Details <small>Optional</small></span><textarea rows={3} maxLength={1000} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} /></label><button className="button button-primary" type="submit" disabled={submitting}><Flag aria-hidden="true" size={15} /> Send report</button></form>}
      {notice && <p className="form-message form-success" role="status"><CheckCircle2 aria-hidden="true" size={17} /> {notice}</p>}
      {error && <p className="form-message form-error" role="alert">{error}</p>}

      <footer className="discussion-community-note"><ShieldCheck aria-hidden="true" size={20} /><p><strong>Keep discussion useful.</strong> Do not post copyrighted book content, instructor-only materials, private data, credentials, or student records. Challenge ideas constructively and explain evidence, assumptions, and engineering consequences.</p></footer>
    </div>
  );
}
