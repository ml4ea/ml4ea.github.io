import { ArrowLeft, BookOpen, CheckCircle2, Code2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sanitizeNotebookHtml } from '../lib/sanitizeNotebookHtml';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import NotebookUseControl from './NotebookUseControl';

interface ExampleSummary {
  slug: string;
  ae_number: string;
  title: string;
  topic: 'classification' | 'deep_neural_network' | 'generative_models';
  method: string;
  source_filename: string;
  source_sha256: string;
  sort_order: number;
}

const topicLabels: Record<ExampleSummary['topic'], string> = {
  classification: 'Classification',
  deep_neural_network: 'Deep neural network',
  generative_models: 'Generative models',
};

const exampleFromUrl = () => new URLSearchParams(window.location.search).get('example');

export default function PublisherExampleViewer() {
  const [session, setSession] = useState<Session | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [examples, setExamples] = useState<ExampleSummary[]>([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [exampleLoading, setExampleLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async (activeSession: Session | null) => {
    const supabase = getSupabaseClient();
    setSession(activeSession);
    setExamples([]);
    setBodyHtml('');
    if (!supabase || !activeSession) { setAuthorized(false); setLoading(false); return; }
    setLoading(true);
    setError('');
    const [{ data: reviewer, error: reviewerError }, { data: admin }, { data: bookOwner }] = await Promise.all([
      supabase.rpc('is_publisher_reviewer'),
      supabase.rpc('is_portal_admin'),
      supabase.rpc('is_verified_book_owner'),
    ]);
    if (reviewerError || (!reviewer && !admin && !bookOwner)) {
      setAuthorized(false);
      setError(reviewerError?.message ?? 'Publisher review access is required.');
      setLoading(false);
      return;
    }
    setAuthorized(true);
    const { data, error: examplesError } = await supabase
      .from('publisher_review_ae_examples')
      .select('slug,ae_number,title,topic,method,source_filename,source_sha256,sort_order')
      .order('sort_order');
    if (examplesError) {
      setError(examplesError.message);
      setLoading(false);
      return;
    }
    const available = (data ?? []) as ExampleSummary[];
    const requested = exampleFromUrl();
    setExamples(available);
    setSelectedSlug(available.some((example) => example.slug === requested) ? requested! : available[0]?.slug ?? '');
    setLoading(false);
  };

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => void load(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => window.setTimeout(() => void load(nextSession), 0));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !authorized || !selectedSlug) return;
    let current = true;
    setExampleLoading(true);
    setBodyHtml('');
    setError('');
    supabase
      .from('publisher_review_ae_examples')
      .select('body_html')
      .eq('slug', selectedSlug)
      .single()
      .then(({ data, error: contentError }) => {
        if (!current) return;
        setExampleLoading(false);
        if (contentError) {
          setError(contentError.message);
          return;
        }
        setBodyHtml(sanitizeNotebookHtml((data as { body_html: string }).body_html));
      });
    return () => { current = false; };
  }, [authorized, selectedSlug]);

  const chooseExample = (slug: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('example', slug);
    window.history.pushState({}, '', url);
    setSelectedSlug(slug);
    document.querySelector('.publisher-example-reader')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!isSupabaseConfigured) return <p className="account-loading">Publisher example access is being connected.</p>;
  if (loading) return <p className="account-loading" aria-live="polite">Checking protected example access...</p>;
  if (!session) return <div className="account-state"><ShieldCheck aria-hidden="true" size={28} /><div><h2>Publisher reviewer sign-in required.</h2><p>Sign in with the exact email address invited by the portal administrator.</p><a className="button button-primary" href="/account?next=/publisher-review/application-examples/">Sign in</a></div></div>;
  if (!authorized) return <div className="account-state account-unconfigured"><LockKeyhole aria-hidden="true" size={28} /><div><h2>Publisher review access required.</h2><p>This protected notebook collection is limited to active publisher reviewers and portal administrators.</p>{error && <p className="form-message form-error" role="alert">{error}</p>}</div></div>;
  if (examples.length === 0) return <div className="account-state"><BookOpen aria-hidden="true" size={28} /><div><h2>The selected examples are being prepared.</h2><p>Your review access is active. The three notebooks will appear after protected content is loaded.</p>{error && <p className="form-message form-error" role="alert">{error}</p>}</div></div>;

  const selected = examples.find((example) => example.slug === selectedSlug) ?? examples[0];

  return <div className="publisher-examples">
    <div className="catalog-status"><p><CheckCircle2 aria-hidden="true" size={17} /> Three complete executed notebooks · protected review only</p><a className="text-link" href="/publisher-review/"><ArrowLeft aria-hidden="true" size={16} /> Review workspace</a></div>

    <nav className="publisher-example-tabs" aria-label="Selected Application Examples">
      {examples.map((example) => <button key={example.slug} type="button" className={example.slug === selected.slug ? 'is-current' : ''} aria-current={example.slug === selected.slug ? 'page' : undefined} onClick={() => chooseExample(example.slug)}>
        <span>AE {example.ae_number}</span>
        <strong>{topicLabels[example.topic]}</strong>
        <small>{example.title}</small>
      </button>)}
    </nav>

    <article className="publisher-example-reader" aria-busy={exampleLoading}>
      <header>
        <div><p className="eyebrow">{topicLabels[selected.topic]} · AE {selected.ae_number}</p><h2>{selected.title}</h2><p>{selected.method}</p></div>
        <div className="publisher-example-source"><Code2 aria-hidden="true" size={18} /><span><strong>Complete executed notebook</strong><small>Source integrity {selected.source_sha256.slice(0, 12)}</small></span></div>
      </header>
      <NotebookUseControl
        key={selected.slug}
        slug={selected.slug}
        aeNumber={selected.ae_number}
        title={selected.title}
        showDormantNotice
      />
      {exampleLoading ? <p className="manual-section-loading">Loading notebook code and outputs...</p> : <div className="notebook-document" dangerouslySetInnerHTML={{ __html: bodyHtml }} />}
      {error && <p className="form-message form-error" role="alert">{error}</p>}
      <footer><LockKeyhole aria-hidden="true" size={16} /><p>Confidential prelaunch review copy. Viewing does not grant permission to publish, redistribute, or reuse this notebook.</p></footer>
    </article>
  </div>;
}
