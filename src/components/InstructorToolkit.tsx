import {
  BookOpen,
  CalendarRange,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileText,
  FlaskConical,
  GraduationCap,
  Library,
  LockKeyhole,
  Search,
  Settings2,
  UsersRound,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

interface ApplicationExample {
  filename: string;
  ae_number: string;
  chapter: number;
  chapter_title: string;
  title: string;
  method: string;
  packages: string[];
  requires_openai_api_key: boolean;
}

interface Props {
  examples: ApplicationExample[];
}

type TeachingMode = 'minimal' | 'standard' | 'extended';

const courseModels = [
  {
    title: 'One-semester core',
    duration: '14-15 weeks',
    audience: 'Graduate or advanced undergraduate engineering students',
    manualSlug: 'chapter-2-one-semester-course-model',
    filename: 'ML4EA-one-semester-syllabus.doc',
  },
  {
    title: 'Quarter system',
    duration: '10 weeks',
    audience: 'Programs needing a compressed survey with focused application work',
    manualSlug: 'chapter-2-quarter-system-model',
    filename: 'ML4EA-quarter-system-syllabus.doc',
  },
  {
    title: 'Advanced-topics pathway',
    duration: '12-14 weeks',
    audience: 'Graduate students with prior introductory ML experience',
    manualSlug: 'chapter-2-selective-advanced-topics-model',
    filename: 'ML4EA-advanced-topics-syllabus.doc',
  },
  {
    title: 'Project-based course',
    duration: '14-15 weeks',
    audience: 'Courses organized around iterative engineering investigation',
    manualSlug: 'chapter-2-project-based-course-model',
    filename: 'ML4EA-project-based-syllabus.doc',
  },
];

const assessmentTemplates = [
  {
    title: 'Assignment template collection',
    description: 'Editable concept homework, AE report, mini-project proposal, and final-project report structures.',
    filename: 'ML4EA-assignment-templates.doc',
    manualSlug: 'chapter-7-sample-assignment-templates',
  },
  {
    title: 'AE and final-project rubrics',
    description: 'Editable criteria and weights for framing, workflow, evaluation, interpretation, and communication.',
    filename: 'ML4EA-assessment-rubrics.doc',
    manualSlug: 'chapter-7-sample-rubrics',
  },
  {
    title: 'AI-aware assessment guidance',
    description: 'Adaptable options for controlled checks, disclosure, process evidence, personalization, and oral verification.',
    filename: 'ML4EA-AI-aware-assessment-guidance.doc',
    manualSlug: 'chapter-6-assessment-with-ai-tool-use',
  },
  {
    title: 'Project idea collection',
    description: 'AE extensions, engineering datasets, comparisons, and advanced integrative project directions.',
    filename: 'ML4EA-project-ideas.doc',
    manualSlug: 'chapter-7-project-ideas',
  },
];

const chapterTitles = [
  'Introduction to AI and Machine Learning in Engineering',
  'Linear Algebra Essentials',
  'Probability and Statistics Fundamentals',
  'Optimization Basics',
  'Introduction to Machine Learning',
  'Supervised Learning: Regression',
  'Supervised Learning: Classification',
  'Ensemble Methods',
  'Neural Networks and Deep Learning',
  'Unsupervised Learning',
  'Reinforcement Learning',
  'Generative Models',
  'Physics-Informed Machine Learning',
  'Specialized ML Techniques and Emergent Topics',
  'Integrating Machine Learning into Engineering Systems',
];

const htmlEscape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

function downloadBlob(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadDocument(filename: string, title: string, bodyHtml: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(title)}</title><style>body{font-family:Arial,sans-serif;line-height:1.45;margin:42px;color:#202324;max-width:900px}h1{font-family:Georgia,serif;font-size:28pt}h2,h3{margin-top:28px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:8px;border:1px solid #999;text-align:left;vertical-align:top}th{background:#eee}li{margin-bottom:8px}.manual-callout{padding:14px 18px;border-left:4px solid #288a5b;background:#f2f4f3}.note{color:#555;font-size:10pt;margin-top:32px}</style></head><body><h1>${htmlEscape(title)}</h1>${bodyHtml}<h2>Local adaptation notes</h2><p>[Add institutional policies, dates, grading details, accessibility information, and course-specific expectations here.]</p><p class="note">Adapted from the protected instructor resources for <i>Machine Learning for Engineering Applications</i> by Yan Jin. For use by the approved instructor; do not redistribute.</p></body></html>`;
  downloadBlob(filename, html, 'application/msword;charset=utf-8');
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function suggestedDifficulty(example: ApplicationExample) {
  if (example.chapter >= 11 || example.packages.some((name) => ['torch', 'tensorflow', 'gymnasium'].includes(name))) return 'Advanced';
  if (example.chapter >= 9 || example.packages.length >= 6) return 'Intermediate';
  return 'Core';
}

const modeGuidance: Record<TeachingMode, { label: string; time: string; activity: string }> = {
  minimal: { label: 'Minimal use', time: '15-25 min', activity: 'Instructor walkthrough with one interpretation prompt' },
  standard: { label: 'Standard use', time: '60-90 min', activity: 'Guided lab plus a short engineering conclusion' },
  extended: { label: 'Extended use', time: '1-3 weeks', activity: 'Model comparison, failure analysis, and documented extension' },
};

export default function InstructorToolkit({ examples }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [approved, setApproved] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [chapter, setChapter] = useState('all');
  const [mode, setMode] = useState<TeachingMode>('standard');
  const [documentLoading, setDocumentLoading] = useState('');

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const checkAccess = async (activeSession: Session | null) => {
      setSession(activeSession);
      if (!activeSession) { setApproved(null); setLoading(false); return; }
      setLoading(true);
      const { data, error: accessError } = await supabase.rpc('is_approved_instructor');
      setApproved(Boolean(data));
      setError(accessError?.message ?? '');
      setLoading(false);
    };
    supabase.auth.getSession().then(({ data }) => void checkAccess(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => window.setTimeout(() => void checkAccess(nextSession), 0));
    return () => listener.subscription.unsubscribe();
  }, []);

  const filteredExamples = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return examples.filter((example) => (chapter === 'all' || String(example.chapter) === chapter) && (!needle || `${example.ae_number} ${example.title} ${example.method} ${example.chapter_title}`.toLowerCase().includes(needle)));
  }, [chapter, examples, query]);

  const exportPlanner = () => {
    const guidance = modeGuidance[mode];
    const rows = [['AE', 'Chapter', 'Title', 'Method', 'Difficulty', 'Teaching mode', 'Suggested time', 'Suggested activity'], ...filteredExamples.map((example) => [example.ae_number, example.chapter, example.title, example.method, suggestedDifficulty(example), guidance.label, guidance.time, guidance.activity])];
    downloadBlob('ML4EA-AE-teaching-plan.csv', rows.map((row) => row.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
  };

  const downloadProtectedSection = async (slug: string, filename: string, title: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setDocumentLoading(slug);
    setError('');
    const { data: edition, error: editionError } = await supabase
      .from('instructor_manual_editions')
      .select('id')
      .eq('is_current', true)
      .single();
    if (editionError) {
      setDocumentLoading('');
      setError(editionError.message);
      return;
    }
    const { data, error: sectionError } = await supabase
      .from('instructor_manual_sections')
      .select('body_html')
      .eq('slug', slug)
      .eq('edition_id', edition.id)
      .single();
    setDocumentLoading('');
    if (sectionError) {
      setError(sectionError.message);
      return;
    }
    downloadDocument(filename, title, (data as { body_html: string }).body_html);
  };

  if (!isSupabaseConfigured) return <div className="account-state"><LockKeyhole aria-hidden="true" size={28} /><div><h2>The teaching toolkit is being connected.</h2><p>Protected materials will appear after the account service is configured.</p></div></div>;
  if (loading) return <p className="account-loading" aria-live="polite">Checking teaching-resource access…</p>;
  if (!session) return <div className="account-state"><GraduationCap aria-hidden="true" size={28} /><div><h2>Instructor sign-in required.</h2><p>Sign in with the verified account associated with your instructor approval.</p><a className="button button-primary" href="/account?next=/instructor/toolkit/">Sign in</a></div></div>;
  if (!approved) return <div className="account-state account-unconfigured"><LockKeyhole aria-hidden="true" size={28} /><div><h2>Approved instructor access required.</h2><p>This account does not currently have access to the protected teaching toolkit.</p><a className="button button-primary" href="/instructor">Request or review access</a>{error && <p className="form-message form-error" role="alert">{error}</p>}</div></div>;

  return (
    <div className="toolkit-shell">
      <nav className="toolkit-jump-nav" aria-label="Teaching toolkit sections">
        <a href="#course-planning"><CalendarRange aria-hidden="true" size={17} /> Course planning</a>
        <a href="#ae-planner"><FlaskConical aria-hidden="true" size={17} /> AE planner</a>
        <a href="#assessment"><ClipboardCheck aria-hidden="true" size={17} /> Assessment</a>
        <a href="#chapter-support"><Library aria-hidden="true" size={17} /> Chapter support</a>
        <a href="#course-startup"><Settings2 aria-hidden="true" size={17} /> Course startup</a>
      </nav>

      <section className="toolkit-section" id="course-planning">
        <div className="toolkit-section-heading"><div><p className="eyebrow">Course planning kit</p><h2>Begin with a workable structure.</h2></div><p>Each editable syllabus is a starting point. Review the complete rationale and alternatives in the online manual before adapting dates, assessment, and institutional policies.</p></div>
        <div className="toolkit-course-grid">
          {courseModels.map((model) => <article key={model.title}>
            <span>{model.duration}</span><h3>{model.title}</h3><p>{model.audience}</p>
            <div className="toolkit-card-actions">
              <a className="text-link" href={`/instructor/manual/?section=${model.manualSlug}`}>Open guidance <ExternalLink aria-hidden="true" size={15} /></a>
              <button className="button button-secondary" type="button" disabled={documentLoading === model.manualSlug} onClick={() => void downloadProtectedSection(model.manualSlug, model.filename, `${model.title} syllabus template`)}><Download aria-hidden="true" size={16} /> {documentLoading === model.manualSlug ? 'Preparing…' : 'Editable syllabus'}</button>
            </div>
          </article>)}
        </div>
      </section>

      <section className="toolkit-section toolkit-section-soft" id="ae-planner">
        <div className="toolkit-section-heading"><div><p className="eyebrow">AE teaching planner</p><h2>Choose examples by purpose, not volume.</h2></div><p>Filter the 56 companion notebooks, choose a teaching mode, and export the current selection as an editable planning sheet.</p></div>
        <div className="toolkit-controls">
          <label><span>Search examples</span><div className="toolkit-search"><Search aria-hidden="true" size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Problem, method, or AE number" /></div></label>
          <label><span>Chapter</span><select value={chapter} onChange={(event) => setChapter(event.target.value)}><option value="all">All chapters</option>{Array.from(new Set(examples.map((example) => example.chapter))).map((number) => <option key={number} value={number}>Chapter {number}</option>)}</select></label>
          <label><span>Teaching mode</span><select value={mode} onChange={(event) => setMode(event.target.value as TeachingMode)}><option value="minimal">Minimal use</option><option value="standard">Standard use</option><option value="extended">Extended use</option></select></label>
          <button className="button button-primary" type="button" onClick={exportPlanner}><Download aria-hidden="true" size={16} /> Export {filteredExamples.length}</button>
        </div>
        <div className="toolkit-mode-note"><strong>{modeGuidance[mode].label}</strong><span>{modeGuidance[mode].time}</span><p>{modeGuidance[mode].activity}</p></div>
        <div className="toolkit-table-wrap">
          <table className="toolkit-ae-table"><thead><tr><th>AE</th><th>Engineering application</th><th>Method</th><th>Level</th><th><span className="sr-only">Notebook</span></th></tr></thead><tbody>{filteredExamples.map((example) => <tr key={example.filename}><td><strong>{example.ae_number}</strong><small>Ch. {example.chapter}</small></td><td>{example.title}</td><td>{example.method}</td><td>{suggestedDifficulty(example)}</td><td><a className="icon-link" href={`https://github.com/ml4ea/ae-notebooks/blob/main/${example.filename}`} target="_blank" rel="noreferrer" aria-label={`Open ${example.title} notebook`}><ExternalLink aria-hidden="true" size={17} /></a></td></tr>)}</tbody></table>
        </div>
        {filteredExamples.length === 0 && <p className="resource-empty">No Application Examples match these filters.</p>}
      </section>

      <section className="toolkit-section" id="assessment">
        <div className="toolkit-section-heading"><div><p className="eyebrow">Assessment toolkit</p><h2>Make reasoning and judgment assessable.</h2></div><p>The editable templates reward problem framing, workflow decisions, interpretation, and accountability. Adapt them to course level and local policy.</p></div>
        <div className="toolkit-resource-list">
          {assessmentTemplates.map((template) => <article key={template.title}><FileText aria-hidden="true" size={21} /><div><h3>{template.title}</h3><p>{template.description}</p></div><button className="button button-secondary" type="button" disabled={documentLoading === template.manualSlug} onClick={() => void downloadProtectedSection(template.manualSlug, template.filename, template.title)}><Download aria-hidden="true" size={16} /> {documentLoading === template.manualSlug ? 'Preparing…' : 'Editable document'}</button></article>)}
        </div>
        <div className="toolkit-inline-links"><a className="text-link" href="/instructor/manual/?section=chapter-6-assessment-guidance">Read assessment guidance <ExternalLink aria-hidden="true" size={15} /></a><a className="text-link" href="/instructor/manual/?section=chapter-7-project-ideas">Review project ideas <ExternalLink aria-hidden="true" size={15} /></a></div>
      </section>

      <section className="toolkit-section toolkit-section-soft" id="chapter-support">
        <div className="toolkit-section-heading"><div><p className="eyebrow">Lecture and chapter support</p><h2>Prepare around the teaching decision.</h2></div><p>Open concise instructor notes for emphasis, common difficulties, AE choices, assignments, and engineering interpretation.</p></div>
        <div className="toolkit-chapter-grid">{chapterTitles.map((title, index) => {
          const slug = `chapter-5-bc-${index + 1}-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
          return <a key={title} href={`/instructor/manual/?section=${slug}`}><span>{String(index + 1).padStart(2, '0')}</span><strong>{title}</strong><ExternalLink aria-hidden="true" size={15} /></a>;
        })}</div>
        <p className="toolkit-rights-note"><BookOpen aria-hidden="true" size={17} /> Original lecture outlines and activities may be added here. Book figures or substantial excerpts will not be redistributed without the necessary publisher permission.</p>
      </section>

      <section className="toolkit-section" id="course-startup">
        <div className="toolkit-section-heading"><div><p className="eyebrow">Technical setup</p><h2>Remove avoidable friction before week one.</h2></div><button className="button button-secondary" type="button" disabled={documentLoading === 'chapter-7-course-startup-checklist'} onClick={() => void downloadProtectedSection('chapter-7-course-startup-checklist', 'ML4EA-course-startup-checklist.doc', 'ML4EA course-startup checklist')}><Download aria-hidden="true" size={16} /> {documentLoading === 'chapter-7-course-startup-checklist' ? 'Preparing…' : 'Editable checklist'}</button></div>
        <div className="toolkit-startup-grid"><div className="toolkit-setup-points"><div><strong>Environment</strong><span>Choose Colab, JupyterLab, or a documented local environment.</span></div><div><strong>Reproducibility</strong><span>Test notebooks from a fresh runtime and record package expectations.</span></div><div><strong>Responsibility</strong><span>Set course rules for data, AI-tool use, collaboration, and reporting.</span></div></div><aside><Settings2 aria-hidden="true" size={24} /><h3>Recommended baseline</h3><p>Google Colab offers the lowest-friction start. JupyterLab or a documented virtual environment is a suitable local alternative. Test every assigned notebook from a fresh runtime.</p><a className="text-link" href="/instructor/manual/?section=chapter-7-software-and-computing-setup-guidance">Open setup guidance <ExternalLink aria-hidden="true" size={15} /></a></aside></div>
      </section>

      {error && <p className="form-message form-error" role="alert">{error}</p>}

      <section className="toolkit-contribution-band">
        <UsersRound aria-hidden="true" size={28} /><div><p className="eyebrow">Instructor contributions</p><h2>Share an adaptation that worked.</h2><p>Propose a syllabus variation, assignment, rubric, classroom activity, or AE extension. Contributions are reviewed for relevance, rights, attribution, and student privacy before publication.</p></div><a className="button button-primary" href="https://github.com/ml4ea/ml4ea.github.io/issues/new?template=teaching-resource.yml" target="_blank" rel="noreferrer">Propose a resource <ExternalLink aria-hidden="true" size={16} /></a>
      </section>
    </div>
  );
}
