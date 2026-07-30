import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Copyright,
  Download,
  FileText,
  LockKeyhole,
  Menu,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { type SubmitEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sanitizeManualHtml } from '../lib/sanitizeManualHtml';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

interface ManualEdition {
  id: string;
  title: string;
  version_label: string;
  published_on: string;
  pdf_storage_path: string;
  usage_notice: string;
}

interface ManualSection {
  id: string;
  slug: string;
  chapter_number: number;
  chapter_title: string;
  title: string;
  kind: 'frontmatter' | 'chapter' | 'section';
  sort_order: number;
}

interface SearchResult {
  slug: string;
  title: string;
  chapter_number: number;
  chapter_title: string;
  snippet: string;
  rank: number;
}

const MANUAL_COPYRIGHT_NOTICE_VERSION = 'manual-copyright-2026-07-29';

const sectionFromUrl = () => new URLSearchParams(window.location.search).get('section');

function SearchSnippet({ text }: { text: string }) {
  const parts = text.split(/(<mark>|<\/mark>)/);
  let highlighted = false;
  return <>{parts.map((part, index) => {
    if (part === '<mark>') { highlighted = true; return null; }
    if (part === '</mark>') { highlighted = false; return null; }
    return highlighted ? <mark key={index}>{part}</mark> : <span key={index}>{part}</span>;
  })}</>;
}

export default function InstructorManual() {
  const [session, setSession] = useState<Session | null>(null);
  const [approved, setApproved] = useState<boolean | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [edition, setEdition] = useState<ManualEdition | null>(null);
  const [sections, setSections] = useState<ManualSection[]>([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [copyrightAccepted, setCopyrightAccepted] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchComplete, setSearchComplete] = useState(false);
  const [error, setError] = useState('');
  const downloadDialogRef = useRef<HTMLDialogElement>(null);

  const loadManual = async (activeSession: Session | null) => {
    const supabase = getSupabaseClient();
    if (!supabase || !activeSession) {
      setApproved(null);
      setEdition(null);
      setSections([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const [
      { data: access, error: accessError },
      { data: reviewer },
      { data: instructor },
      { data: administrator },
    ] = await Promise.all([
      supabase.rpc('can_view_instructor_manual'),
      supabase.rpc('is_publisher_reviewer'),
      supabase.rpc('is_approved_instructor'),
      supabase.rpc('is_portal_admin'),
    ]);
    if (accessError) {
      setError(accessError.message);
      setLoading(false);
      return;
    }
    setApproved(Boolean(access));
    setReviewOnly(Boolean(reviewer && !instructor && !administrator));
    if (!access) {
      setLoading(false);
      return;
    }

    const { data: editionData, error: editionError } = await supabase
      .from('instructor_manual_editions')
      .select('id,title,version_label,published_on,pdf_storage_path,usage_notice')
      .eq('is_current', true)
      .maybeSingle();
    if (editionError) {
      setError(editionError.message);
      setLoading(false);
      return;
    }
    if (!editionData) {
      setEdition(null);
      setLoading(false);
      return;
    }

    const currentEdition = editionData as ManualEdition;
    const { data: sectionData, error: sectionError } = await supabase
      .from('instructor_manual_sections')
      .select('id,slug,chapter_number,chapter_title,title,kind,sort_order')
      .eq('edition_id', currentEdition.id)
      .order('sort_order');
    if (sectionError) {
      setError(sectionError.message);
      setLoading(false);
      return;
    }

    const availableSections = (sectionData ?? []) as ManualSection[];
    const requested = sectionFromUrl();
    setEdition(currentEdition);
    setSections(availableSections);
    setSelectedSlug(availableSections.some((section) => section.slug === requested) ? requested! : availableSections[0]?.slug ?? '');
    setLoading(false);
  };

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      void loadManual(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      window.setTimeout(() => void loadManual(nextSession), 0);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const requested = sectionFromUrl();
      if (requested && sections.some((section) => section.slug === requested)) setSelectedSlug(requested);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [sections]);

  useEffect(() => {
    if (!downloadDialogOpen || !downloadDialogRef.current || downloadDialogRef.current.open) return;
    downloadDialogRef.current.showModal();
  }, [downloadDialogOpen]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !selectedSlug || !approved) return;
    let current = true;
    setSectionLoading(true);
    setError('');
    supabase
      .from('instructor_manual_sections')
      .select('body_html')
      .eq('slug', selectedSlug)
      .eq('edition_id', edition?.id ?? '')
      .single()
      .then(({ data, error: sectionError }) => {
        if (!current) return;
        setSectionLoading(false);
        if (sectionError) {
          setError(sectionError.message);
          setBodyHtml('');
          return;
        }
        setBodyHtml(sanitizeManualHtml((data as { body_html: string }).body_html));
        document.querySelector('.manual-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    return () => { current = false; };
  }, [approved, edition?.id, selectedSlug]);

  const groupedSections = useMemo(() => {
    const groups: Array<{ key: string; label: string; sections: ManualSection[] }> = [];
    for (const section of sections) {
      const key = section.chapter_number === 0 ? 'frontmatter' : `chapter-${section.chapter_number}`;
      const existing = groups.find((group) => group.key === key);
      if (existing) existing.sections.push(section);
      else groups.push({ key, label: section.chapter_number === 0 ? 'Opening material' : `Chapter ${section.chapter_number}: ${section.chapter_title}`, sections: [section] });
    }
    return groups;
  }, [sections]);

  const selectedIndex = sections.findIndex((section) => section.slug === selectedSlug);
  const selected = sections[selectedIndex];
  const previous = selectedIndex > 0 ? sections[selectedIndex - 1] : null;
  const next = selectedIndex >= 0 && selectedIndex < sections.length - 1 ? sections[selectedIndex + 1] : null;

  const chooseSection = (slug: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('section', slug);
    window.history.pushState({}, '', url);
    setSelectedSlug(slug);
    setTocOpen(false);
  };

  const searchManual = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase || query.trim().length < 2) return;
    setSearching(true);
    setSearchComplete(false);
    setError('');
    const { data, error: searchError } = await supabase.rpc('search_instructor_manual', { p_query: query.trim() });
    setSearching(false);
    setSearchComplete(true);
    if (searchError) {
      setError(searchError.message);
      return;
    }
    setResults((data ?? []) as SearchResult[]);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setSearchComplete(false);
  };

  const closeDownloadDialog = () => {
    if (downloading) return;
    downloadDialogRef.current?.close();
    setDownloadDialogOpen(false);
    setCopyrightAccepted(false);
    setError('');
  };

  const downloadPdf = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !edition || !copyrightAccepted) return;
    setDownloading(true);
    setError('');
    const { data, error: downloadError } = await supabase.functions.invoke('deliver-instructor-manual', {
      body: {
        editionId: edition.id,
        noticeVersion: MANUAL_COPYRIGHT_NOTICE_VERSION,
      },
    });
    setDownloading(false);
    if (downloadError) {
      const response = (downloadError as { context?: Response }).context;
      const responseBody = response
        ? await response.clone().json().catch(() => null) as { error?: string } | null
        : null;
      setError(responseBody?.error ?? data?.error ?? downloadError.message);
      return;
    }
    if (!data?.signedUrl) {
      setError(data?.error ?? 'The protected manual download could not be prepared.');
      return;
    }
    downloadDialogRef.current?.close();
    setDownloadDialogOpen(false);
    setCopyrightAccepted(false);
    window.open(data.signedUrl as string, '_blank', 'noopener,noreferrer');
  };

  if (!isSupabaseConfigured) return <div className="account-state account-unconfigured"><LockKeyhole aria-hidden="true" size={28} /><div><h2>The online manual is being connected.</h2><p>The protected edition will appear after the account service is configured.</p></div></div>;
  if (loading) return <p className="account-loading" aria-live="polite">Checking manual access…</p>;
  if (!session) return <div className="account-state"><BookOpen aria-hidden="true" size={28} /><div><h2>Protected manual sign-in required.</h2><p>Sign in with an approved instructor or invited publisher-review account.</p><a className="button button-primary" href="/account?next=/instructor/manual/">Sign in</a></div></div>;
  if (approved === false) return <div className="account-state account-unconfigured"><ShieldCheck aria-hidden="true" size={28} /><div><h2>Protected manual access required.</h2><p>This account does not currently have access to the online manual.</p><a className="button button-primary" href="/instructor">Request instructor access</a></div></div>;
  if (!edition || sections.length === 0) return <div className="account-state"><FileText aria-hidden="true" size={28} /><div><h2>The online edition is being prepared.</h2><p>Your protected access is active. The manual will appear here when the current edition is published.</p>{error && <p className="form-message form-error" role="alert">{error}</p>}</div></div>;

  return (
    <div className="manual-shell">
      <header className="manual-toolbar">
        <button className="manual-toc-toggle" type="button" onClick={() => setTocOpen(!tocOpen)} aria-expanded={tocOpen} aria-controls="manual-toc">
          {tocOpen ? <X aria-hidden="true" size={19} /> : <Menu aria-hidden="true" size={19} />} Contents
        </button>
        <div className="manual-edition"><span>{edition.version_label} edition</span><small>{reviewOnly ? 'Publisher review preview' : 'Protected instructor resource'}</small></div>
        {reviewOnly ? <a className="button button-secondary" href="/publisher-review/"><ArrowLeft aria-hidden="true" size={17} /> Review workspace</a> : <button className="button button-secondary" type="button" onClick={() => { setError(''); setDownloadDialogOpen(true); }}><Download aria-hidden="true" size={17} /> Download PDF</button>}
      </header>

      {downloadDialogOpen && <dialog ref={downloadDialogRef} className="ae-use-dialog manual-download-dialog" aria-labelledby="manual-download-title" onCancel={(event) => { event.preventDefault(); closeDownloadDialog(); }} onClose={() => setDownloadDialogOpen(false)}>
        <button className="ae-use-dialog-close" type="button" onClick={closeDownloadDialog} aria-label="Close copyright notice" disabled={downloading}>
          <X aria-hidden="true" size={22} />
        </button>
        <p className="eyebrow">Protected instructor resource</p>
        <h2 id="manual-download-title">Review copyright restrictions.</h2>
        <p className="ae-use-dialog-description">{edition.title} · {edition.version_label} edition</p>

        <div className="ae-access-notice">
          <Copyright aria-hidden="true" size={21} />
          <div>
            <strong>Copyright and permitted use</strong>
            <p>This manual and its contents are protected by copyright. The downloaded copy is for your personal use in preparing and teaching courses. Do not share, post publicly, reproduce, redistribute, or provide the file to others. Approved access does not transfer copyright.</p>
          </div>
        </div>

        <label className="ae-acknowledgment">
          <input type="checkbox" checked={copyrightAccepted} onChange={(event) => setCopyrightAccepted(event.target.checked)} disabled={downloading} />
          <span>I have read these restrictions and agree to use the downloaded manual only as permitted.</span>
        </label>

        {error && <p className="form-message form-error" role="alert">{error}</p>}
        <div className="ae-use-dialog-actions">
          <button className="button button-secondary" type="button" onClick={closeDownloadDialog} disabled={downloading}>Cancel</button>
          <button className="button button-primary" type="button" onClick={() => void downloadPdf()} disabled={!copyrightAccepted || downloading}>
            <Download aria-hidden="true" size={17} /> {downloading ? 'Preparing PDF…' : 'Download PDF'}
          </button>
        </div>
      </dialog>}

      <div className="manual-workspace">
        <aside id="manual-toc" className={`manual-toc${tocOpen ? ' is-open' : ''}`} aria-label="Manual contents">
          <form className="manual-search" onSubmit={searchManual} role="search">
            <label htmlFor="manual-search-input">Search manual</label>
            <div><Search aria-hidden="true" size={17} /><input id="manual-search-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} placeholder="Topic or phrase" /><button type="submit" disabled={searching}>{searching ? 'Searching…' : 'Search'}</button></div>
          </form>

          {searchComplete ? (
            <div className="manual-search-results" aria-live="polite">
              <div className="manual-search-heading"><strong>{results.length} {results.length === 1 ? 'result' : 'results'}</strong><button type="button" onClick={clearSearch}>Clear</button></div>
              {results.map((result) => <button key={result.slug} type="button" onClick={() => chooseSection(result.slug)}><small>{result.chapter_number === 0 ? 'Opening material' : `Chapter ${result.chapter_number}`}</small><strong>{result.title}</strong><span><SearchSnippet text={result.snippet} /></span></button>)}
            </div>
          ) : (
            <nav>
              {groupedSections.map((group) => <section key={group.key}><h2>{group.label}</h2>{group.sections.map((section) => <button key={section.id} type="button" className={section.slug === selectedSlug ? 'is-current' : ''} aria-current={section.slug === selectedSlug ? 'page' : undefined} onClick={() => chooseSection(section.slug)}>{section.title}</button>)}</section>)}
            </nav>
          )}
        </aside>

        <article className="manual-article" aria-busy={sectionLoading}>
          <div className="manual-article-heading">
            <p className="eyebrow">{selected?.chapter_number === 0 ? 'Instructor’s manual' : `Chapter ${selected?.chapter_number} · ${selected?.chapter_title}`}</p>
            <h2>{selected?.title}</h2>
          </div>
          {sectionLoading ? <p className="manual-section-loading">Loading section…</p> : <div className="manual-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />}
          {error && <p className="form-message form-error" role="alert">{error}</p>}
          <nav className="manual-pagination" aria-label="Manual section navigation">
            {previous ? <button type="button" onClick={() => chooseSection(previous.slug)}><ArrowLeft aria-hidden="true" size={18} /><span><small>Previous</small>{previous.title}</span></button> : <span />}
            {next && <button type="button" onClick={() => chooseSection(next.slug)}><span><small>Next</small>{next.title}</span><ArrowRight aria-hidden="true" size={18} /></button>}
          </nav>
          <p className="manual-usage-notice"><LockKeyhole aria-hidden="true" size={15} /> {edition.usage_notice}</p>
        </article>
      </div>
    </div>
  );
}
