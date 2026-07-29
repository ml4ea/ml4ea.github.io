import { BookOpen, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { ApplicationExample } from './ApplicationExampleExplorer';
import { applicationExampleSlug } from '../lib/applicationExampleSlug';
import { renderNotebookHtml } from '../lib/renderNotebookHtml';
import { sanitizeNotebookHtml } from '../lib/sanitizeNotebookHtml';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import NotebookUseControl from './NotebookUseControl';

interface Props {
  examples: ApplicationExample[];
}

const exampleFromUrl = () => new URLSearchParams(window.location.search).get('example');

export default function PublisherExampleViewer({ examples }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [requestedSlug, setRequestedSlug] = useState<string | null>(null);
  const [notebookHtml, setNotebookHtml] = useState('');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState('');

  const load = async (activeSession: Session | null, requested: string) => {
    const supabase = getSupabaseClient();
    setSession(activeSession);
    setNotebookHtml('');
    if (!supabase || !activeSession) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const { data, error: exampleError } = await supabase.functions.invoke('deliver-ae-notebook', {
      body: { slug: requested, action: 'view' },
    });

    if (exampleError || !data?.notebookBase64) {
      const response = (exampleError as { context?: Response } | null)?.context;
      const responseBody = response
        ? await response.clone().json().catch(() => null) as { error?: string } | null
        : null;
      setError(responseBody?.error ?? data?.error ?? exampleError?.message ?? 'The notebook could not be loaded.');
      setLoading(false);
      return;
    }

    try {
      const notebookJson = window.atob(data.notebookBase64 as string);
      const bytes = Uint8Array.from(notebookJson, (character) => character.charCodeAt(0));
      const notebook = JSON.parse(new TextDecoder().decode(bytes));
      setNotebookHtml(sanitizeNotebookHtml(renderNotebookHtml(notebook)));
      setLoading(false);
    } catch {
      setError('The notebook content could not be read.');
      setLoading(false);
    }
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
  const example = examples.find((item) => applicationExampleSlug(item) === requestedSlug);
  if (!requestedSlug) {
    return <div className="ae-single-state account-state account-unconfigured"><BookOpen aria-hidden="true" size={28} /><div><h2>No Application Example was selected.</h2><p>Return to the catalog and choose a notebook.</p><a className="button button-secondary" href="/application-examples#notebooks">Return to the catalog</a></div></div>;
  }
  if (!example) return <div className="ae-single-state account-state account-unconfigured"><LockKeyhole aria-hidden="true" size={28} /><div><h2>This Application Example was not found.</h2><p>Return to the catalog and choose an available notebook.</p><a className="button button-secondary" href="/application-examples#notebooks">Return to the catalog</a></div></div>;
  if (!isSupabaseConfigured) return <p className="account-loading">Example access is being connected.</p>;
  if (loading) return <p className="account-loading" aria-live="polite">Loading the selected example...</p>;
  if (!session) {
    return <div className="ae-single-state account-state"><ShieldCheck aria-hidden="true" size={28} /><div><h2>Sign in to read this example.</h2><p>All Application Examples are available to verified portal accounts and approved instructors.</p><a className="button button-primary" href={`/account?next=${encodeURIComponent(returnPath)}`}>Sign in</a></div></div>;
  }
  if (!notebookHtml) {
    return <div className="ae-single-state account-state account-unconfigured"><LockKeyhole aria-hidden="true" size={28} /><div><h2>This example could not be opened.</h2><p>The address may be invalid, or the protected preview may be temporarily unavailable.</p>{error && <p className="form-message form-error" role="alert">{error}</p>}<a className="button button-secondary" href="/application-examples#notebooks">Return to the catalog</a></div></div>;
  }

  return <article className="ae-single-example">
    <NotebookUseControl
      slug={requestedSlug}
      aeNumber={example.ae_number}
      title={example.title}
    />
    <div
      className="notebook-document"
      dangerouslySetInnerHTML={{ __html: notebookHtml }}
    />
  </article>;
}
