import { BookOpen, CheckCircle2, Database, ExternalLink, KeyRound, LogIn, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getApplicationExampleDataset } from '../data/applicationExampleDatasets';
import { applicationExampleSlug } from '../lib/applicationExampleSlug';
import { getSupabaseClient } from '../lib/supabase';

export interface ApplicationExample {
  filename: string;
  ae_number: string;
  chapter: number;
  chapter_title: string;
  title: string;
  method: string;
  source_urls: string[];
  packages: string[];
  requires_openai_api_key: boolean;
  validation_status: string;
}

interface Props {
  examples: ApplicationExample[];
}

const normalize = (value: string) => value.toLowerCase().trim();

export default function ApplicationExampleExplorer({ examples }: Props) {
  const [query, setQuery] = useState('');
  const [chapter, setChapter] = useState('All chapters');
  const [session, setSession] = useState<Session | null>(null);
  const [sessionKnown, setSessionKnown] = useState(false);
  const [signInTarget, setSignInTarget] = useState('');
  const signInDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const chapterValue = params.get('chapter');
    const queryValue = params.get('q');
    if (chapterValue) setChapter(chapterValue);
    if (queryValue) setQuery(queryValue);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setSessionKnown(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionKnown(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setSessionKnown(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!signInTarget || !signInDialogRef.current || signInDialogRef.current.open) return;
    signInDialogRef.current.showModal();
  }, [signInTarget]);

  const chapters = useMemo(
    () => [...new Set(examples.map((example) => example.chapter))].sort((a, b) => a - b),
    [examples],
  );

  const results = useMemo(() => {
    const needle = normalize(query);
    return examples.filter((example) => {
      const searchable = [
        example.ae_number,
        example.title,
        example.method,
        example.chapter_title,
        getApplicationExampleDataset(example).label,
        ...example.packages,
      ].join(' ');
      const matchesQuery = !needle || normalize(searchable).includes(needle);
      const matchesChapter = chapter === 'All chapters' || example.chapter === Number(chapter);
      return matchesQuery && matchesChapter;
    });
  }, [chapter, examples, query]);

  const hasFilters = query || chapter !== 'All chapters';
  const clearFilters = () => {
    setQuery('');
    setChapter('All chapters');
  };
  const closeSignIn = () => {
    signInDialogRef.current?.close();
    setSignInTarget('');
  };

  return (
    <div className="ae-explorer">
      <div className="catalog-controls ae-controls">
        <label className="search-field">
          <span className="sr-only">Search Application Examples</span>
          <Search aria-hidden="true" size={19} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search methods, applications, and packages"
          />
        </label>
        <label>
          <span>Chapter</span>
          <select value={chapter} onChange={(event) => setChapter(event.target.value)}>
            <option>All chapters</option>
            {chapters.map((option) => <option key={option} value={option}>Chapter {option}</option>)}
          </select>
        </label>
      </div>

      <div className="catalog-status" aria-live="polite">
        <p>{results.length} {results.length === 1 ? 'notebook' : 'notebooks'}</p>
        {hasFilters && (
          <button type="button" className="clear-button" onClick={clearFilters}>
            <X aria-hidden="true" size={16} /> Clear
          </button>
        )}
      </div>

      {results.length > 0 ? (
        <ol className="ae-results">
          {results.map((example) => {
            const slug = applicationExampleSlug(example);
            const examplePath = `/application-examples/view?example=${encodeURIComponent(slug)}`;
            const dataset = getApplicationExampleDataset(example);
            return (
              <li key={example.filename}>
                <article className="ae-result">
                  <div className="ae-result-copy">
                    <div className="result-meta">
                      <span>AE {example.ae_number}</span>
                      <span>Chapter {example.chapter}</span>
                      {example.requires_openai_api_key && <span className="access-note"><KeyRound aria-hidden="true" size={13} /> API key</span>}
                    </div>
                    <h2>{example.title}</h2>
                    <p>{example.method} · {example.chapter_title}</p>
                    <div className="ae-dataset-meta">
                      <Database aria-hidden="true" size={15} />
                      <span>Dataset</span>
                      {dataset.url ? (
                        <a href={dataset.url} target="_blank" rel="noreferrer">
                          {dataset.label} <ExternalLink aria-hidden="true" size={14} />
                        </a>
                      ) : <strong>{dataset.label}</strong>}
                      <em>{dataset.detail}</em>
                    </div>
                    <div className="ae-resource-meta">
                      <span className="validation-complete"><CheckCircle2 aria-hidden="true" size={14} /> Validated in Google Colab</span>
                    </div>
                    <ul className="package-list" aria-label="Key Python packages">
                      {example.packages.slice(0, 5).map((item) => <li key={item}>{item}</li>)}
                      {example.packages.length > 5 && <li>+{example.packages.length - 5}</li>}
                    </ul>
                  </div>
                  <div className="ae-actions">
                    <div className="ae-complete-preview-action">
                      <a
                        className="button button-secondary"
                        href={examplePath}
                        onClick={(event) => {
                          if (!sessionKnown || session) return;
                          event.preventDefault();
                          setSignInTarget(examplePath);
                        }}
                      >
                        <BookOpen aria-hidden="true" size={18} />
                        View example
                      </a>
                      <span>{session ? 'Available to your account' : 'Sign-in required'}</span>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="catalog-empty">
          <Search aria-hidden="true" size={24} />
          <p>No matching Application Examples were found.</p>
        </div>
      )}

      {signInTarget && <dialog
        ref={signInDialogRef}
        className="ae-sign-in-dialog"
        aria-labelledby="ae-sign-in-title"
        onCancel={(event) => { event.preventDefault(); closeSignIn(); }}
        onClose={() => setSignInTarget('')}
      >
        <button className="ae-use-dialog-close" type="button" onClick={closeSignIn} aria-label="Close sign-in request">
          <X aria-hidden="true" size={22} />
        </button>
        <LogIn aria-hidden="true" size={27} />
        <p className="eyebrow">Verified portal account</p>
        <h2 id="ae-sign-in-title">Sign in to open this Application Example.</h2>
        <p>All companion notebooks are available to signed-in users and approved instructors.</p>
        <div className="ae-use-dialog-actions">
          <button className="button button-secondary" type="button" onClick={closeSignIn}>Cancel</button>
          <a className="button button-primary" href={`/account?next=${encodeURIComponent(signInTarget)}`}>
            <LogIn aria-hidden="true" size={17} /> Sign in
          </a>
        </div>
      </dialog>}
    </div>
  );
}
