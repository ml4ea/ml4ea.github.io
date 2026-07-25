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
  const [requestedSlug, setRequestedSlug] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [exampleLoading, setExampleLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async (activeSession: Session | null, requested: string) => {
    const supabase = getSupabaseClient();
    setSession(activeSession);
    setExamples([]);
    setBodyHtml('');
    if (!supabase || !activeSession) { setAuthorized(false); setLoading(false); return; }
    setLoading(true);
    setError('');
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
    setExamples(available);
    setSelectedSlug(available.some((example) => example.slug === requested) ? requested! : available[0]?.slug ?? '');
    setLoading(false);
  };

  useEffect(() => {
    const requested = exampleFromUrl() ?? '';
    setRequestedSlug(requested);
    if (!requested) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => void load(data.session, requested));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => window.setTimeout(() => void load(nextSession, requested), 0));
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

  if (requestedSlug === null || !requestedSlug) return null;
  const returnPath = `/application-examples?example=${encodeURIComponent(requestedSlug)}#complete-example`;
  if (!isSupabaseConfigured) return <div className="ae-complete-example"><p className="account-loading">Complete example access is being connected.</p></div>;
  if (loading) return <div className="ae-complete-example"><p className="account-loading" aria-live="polite">Checking signed-in example access...</p></div>;
  if (!session) return <div className="ae-complete-example account-state"><ShieldCheck aria-hidden="true" size={28} /><div><h2>Sign in to read the complete example.</h2><p>Any verified portal account may view the three complete browser examples during prelaunch.</p><a className="button button-primary" href={`/account?next=${encodeURIComponent(returnPath)}`}>Sign in</a></div></div>;
  if (!authorized) return <div className="ae-complete-example account-state account-unconfigured"><LockKeyhole aria-hidden="true" size={28} /><div><h2>Complete example access is unavailable.</h2><p>Your account is signed in, but the protected preview could not be opened.</p>{error && <p className="form-message form-error" role="alert">{error}</p>}</div></div>;
  if (examples.length === 0) return <div className="ae-complete-example account-state"><BookOpen aria-hidden="true" size={28} /><div><h2>The selected examples are being prepared.</h2><p>The three notebooks will appear after protected content is loaded.</p>{error && <p className="form-message form-error" role="alert">{error}</p>}</div></div>;

  const selected = examples.find((example) => example.slug === selectedSlug) ?? examples[0];

  return <section className="publisher-examples ae-complete-example" aria-label="Complete Application Example">
    <div className="catalog-status"><p><CheckCircle2 aria-hidden="true" size={17} /> Three complete executed notebooks · signed-in browser access</p><a className="text-link" href="#notebooks"><ArrowLeft aria-hidden="true" size={16} /> Back to catalog</a></div>

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
      <footer><LockKeyhole aria-hidden="true" size={16} /><p>Prelaunch browser preview. Viewing does not grant permission to publish, redistribute, or reuse this notebook.</p></footer>
    </article>
  </section>;
}
