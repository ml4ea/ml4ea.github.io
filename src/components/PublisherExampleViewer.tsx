import { BookOpen, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sanitizeNotebookHtml } from '../lib/sanitizeNotebookHtml';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import NotebookUseControl from './NotebookUseControl';

interface CompleteExample {
  slug: string;
  ae_number: string;
  title: string;
  body_html: string;
}

const exampleFromUrl = () => new URLSearchParams(window.location.search).get('example');

export default function PublisherExampleViewer() {
  const [session, setSession] = useState<Session | null>(null);
  const [requestedSlug, setRequestedSlug] = useState<string | null>(null);
  const [example, setExample] = useState<CompleteExample | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState('');

  const load = async (activeSession: Session | null, requested: string) => {
    const supabase = getSupabaseClient();
    setSession(activeSession);
    setExample(null);
    if (!supabase || !activeSession) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const { data, error: exampleError } = await supabase
      .from('publisher_review_ae_examples')
      .select('slug,ae_number,title,body_html')
      .eq('slug', requested)
      .single();

    if (exampleError) {
      setError(exampleError.message);
      setLoading(false);
      return;
    }

    setExample(data as CompleteExample);
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
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => void load(nextSession, requested), 0);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (requestedSlug === null) return null;

  const returnPath = `/application-examples/view?example=${encodeURIComponent(requestedSlug)}`;
  if (!requestedSlug) {
    return <div className="ae-single-state account-state account-unconfigured"><BookOpen aria-hidden="true" size={28} /><div><h2>No Application Example was selected.</h2><p>Return to the catalog and choose one of the three browser examples.</p><a className="button button-secondary" href="/application-examples#notebooks">Return to the catalog</a></div></div>;
  }
  if (!isSupabaseConfigured) return <p className="account-loading">Example access is being connected.</p>;
  if (loading) return <p className="account-loading" aria-live="polite">Loading the selected example...</p>;
  if (!session) {
    return <div className="ae-single-state account-state"><ShieldCheck aria-hidden="true" size={28} /><div><h2>Sign in to read this example.</h2><p>Any verified portal account may view the selected browser example during prelaunch.</p><a className="button button-primary" href={`/account?next=${encodeURIComponent(returnPath)}`}>Sign in</a></div></div>;
  }
  if (!example) {
    return <div className="ae-single-state account-state account-unconfigured"><LockKeyhole aria-hidden="true" size={28} /><div><h2>This example could not be opened.</h2><p>The address may be invalid, or the protected preview may be temporarily unavailable.</p>{error && <p className="form-message form-error" role="alert">{error}</p>}<a className="button button-secondary" href="/application-examples#notebooks">Return to the catalog</a></div></div>;
  }

  return <article className="ae-single-example">
    <NotebookUseControl
      slug={example.slug}
      aeNumber={example.ae_number}
      title={example.title}
      showDormantNotice
    />
    <div
      className="notebook-document"
      dangerouslySetInnerHTML={{ __html: sanitizeNotebookHtml(example.body_html) }}
    />
  </article>;
}
