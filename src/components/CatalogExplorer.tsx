import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { CatalogItem } from '../data/catalog';

interface Props {
  items: CatalogItem[];
  showTypeFilter?: boolean;
  showChapterFilter?: boolean;
  initialQueryFromUrl?: boolean;
  emptyMessage?: string;
}

const normalize = (value: string) => value.toLowerCase().trim();

export default function CatalogExplorer({
  items,
  showTypeFilter = true,
  showChapterFilter = true,
  initialQueryFromUrl = false,
  emptyMessage = 'No matching materials were found.',
}: Props) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('All types');
  const [chapter, setChapter] = useState('All chapters');

  useEffect(() => {
    if (!initialQueryFromUrl) return;
    const params = new URLSearchParams(window.location.search);
    const value = params.get('q');
    const chapterValue = params.get('chapter');
    if (value) setQuery(value);
    if (chapterValue) setChapter(chapterValue);
  }, [initialQueryFromUrl]);

  const types = useMemo(() => [...new Set(items.map((item) => item.type))], [items]);
  const chapters = useMemo(
    () => [...new Set(items.flatMap((item) => item.chapter ?? []))].sort((a, b) => a - b),
    [items],
  );

  const results = useMemo(() => {
    const needle = normalize(query);
    return items.filter((item) => {
      const matchesQuery = !needle || normalize([
        item.title,
        item.description,
        item.type,
        item.chapterTitle ?? '',
        ...item.tags,
      ].join(' ')).includes(needle);
      const matchesType = type === 'All types' || item.type === type;
      const matchesChapter = chapter === 'All chapters' || item.chapter === Number(chapter);
      return matchesQuery && matchesType && matchesChapter;
    });
  }, [chapter, items, query, type]);

  const hasFilters = query || type !== 'All types' || chapter !== 'All chapters';
  const clearFilters = () => {
    setQuery('');
    setType('All types');
    setChapter('All chapters');
  };

  return (
    <div className="catalog-explorer">
      <div className="catalog-controls">
        <label className="search-field">
          <span className="sr-only">Search materials</span>
          <Search aria-hidden="true" size={19} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search topics, examples, and chapters"
          />
        </label>
        {showTypeFilter && (
          <label>
            <span>Type</span>
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option>All types</option>
              {types.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
        )}
        {showChapterFilter && (
          <label>
            <span>Chapter</span>
            <select value={chapter} onChange={(event) => setChapter(event.target.value)}>
              <option>All chapters</option>
              {chapters.map((option) => <option key={option} value={option}>Chapter {option}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="catalog-status" aria-live="polite">
        <p>{results.length} {results.length === 1 ? 'result' : 'results'}</p>
        {hasFilters && (
          <button type="button" className="clear-button" onClick={clearFilters}>
            <X aria-hidden="true" size={16} /> Clear
          </button>
        )}
      </div>

      {results.length > 0 ? (
        <ol className="catalog-results">
          {results.map((item) => (
            <li key={item.id}>
              <div className="result-meta">
                <span>{item.type}</span>
                {item.chapter && <span>Chapter {item.chapter}</span>}
              </div>
              <h2><a href={item.href}>{item.title}</a></h2>
              <p>{item.description}</p>
            </li>
          ))}
        </ol>
      ) : (
        <div className="catalog-empty">
          <Search aria-hidden="true" size={24} />
          <p>{emptyMessage}</p>
        </div>
      )}
    </div>
  );
}
