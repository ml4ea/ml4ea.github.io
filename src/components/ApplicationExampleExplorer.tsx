import { BookOpen, CheckCircle2, KeyRound, LockKeyhole, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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

const completeExampleSlugs: Record<string, string> = {
  'Notebook-07.5.5-SVM-cwru-bearing.ipynb': 'svm-bearing-fault-classification',
  'Notebook-09.5.2-CNN-NEU-DET.ipynb': 'cnn-surface-defect-detection',
  'Notebook-12.3.5-VAE-SensorAnomaly.ipynb': 'vae-sensor-anomaly-detection',
};

export default function ApplicationExampleExplorer({ examples }: Props) {
  const [query, setQuery] = useState('');
  const [chapter, setChapter] = useState('All chapters');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const chapterValue = params.get('chapter');
    const queryValue = params.get('q');
    if (chapterValue) setChapter(chapterValue);
    if (queryValue) setQuery(queryValue);
  }, []);

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
            const completeExampleSlug = completeExampleSlugs[example.filename];
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
                    <div className="ae-resource-meta">
                      <span className="validation-complete"><CheckCircle2 aria-hidden="true" size={14} /> Validated in Google Colab</span>
                    </div>
                    <ul className="package-list" aria-label="Key Python packages">
                      {example.packages.slice(0, 5).map((item) => <li key={item}>{item}</li>)}
                      {example.packages.length > 5 && <li>+{example.packages.length - 5}</li>}
                    </ul>
                  </div>
                  <div className="ae-actions">
                    {completeExampleSlug ? (
                      <div className="ae-complete-preview-action">
                        <a className="button button-secondary" href={`/application-examples/view?example=${completeExampleSlug}`}>
                          <BookOpen aria-hidden="true" size={18} />
                          View example
                        </a>
                        <span>Signed-in browser preview</span>
                      </div>
                    ) : (
                      <div className="ae-access-locked">
                        <LockKeyhole aria-hidden="true" size={19} />
                        <span><strong>Prelaunch</strong>Access pending publisher review</span>
                      </div>
                    )}
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
    </div>
  );
}
