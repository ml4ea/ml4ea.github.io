import { Download, ExternalLink, FileCheck2, GraduationCap, LockKeyhole, MessageSquareText, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

interface CuratedResource {
  id: string;
  title: string;
  description: string;
  category: string;
  storage_path: string;
}

export default function CuratedTeachingContributions() {
  const [session, setSession] = useState<Session | null>(null);
  const [approved, setApproved] = useState<boolean | null>(null);
  const [resources, setResources] = useState<CuratedResource[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [downloading, setDownloading] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const loadCollection = async (activeSession: Session | null) => {
      setSession(activeSession);
      setResources([]);
      if (!activeSession) { setApproved(null); setLoading(false); return; }
      setLoading(true);
      setError('');
      const { data: access, error: accessError } = await supabase.rpc('is_approved_instructor');
      if (accessError || !access) {
        setApproved(false);
        setError(accessError?.message ?? 'Approved instructor access is required.');
        setLoading(false);
        return;
      }
      setApproved(true);
      const { data, error: resourceError } = await supabase
        .from('instructor_resources')
        .select('id,title,description,category,storage_path')
        .eq('published', true)
        .eq('category', 'Community contribution')
        .order('sort_order');
      setResources((data ?? []) as CuratedResource[]);
      setError(resourceError?.message ?? '');
      setLoading(false);
    };
    supabase.auth.getSession().then(({ data }) => void loadCollection(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => window.setTimeout(() => void loadCollection(nextSession), 0));
    return () => listener.subscription.unsubscribe();
  }, []);

  const downloadResource = async (resource: CuratedResource) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setDownloading(resource.id);
    setError('');
    const { data, error: downloadError } = await supabase.storage.from('instructor-materials').createSignedUrl(resource.storage_path, 60);
    setDownloading('');
    if (downloadError) { setError(downloadError.message); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  if (!isSupabaseConfigured) return <div className="account-state"><LockKeyhole aria-hidden="true" size={28} /><div><h2>The curated collection is being connected.</h2><p>Protected materials will appear after the account service is configured.</p></div></div>;
  if (loading) return <p className="account-loading" aria-live="polite">Checking teaching-resource access...</p>;
  if (!session) return <div className="account-state"><GraduationCap aria-hidden="true" size={28} /><div><h2>Instructor sign-in required.</h2><p>Sign in with the verified account associated with your instructor approval.</p><a className="button button-primary" href="/account?next=/instructor/contributions/">Sign in</a></div></div>;
  if (!approved) return <div className="account-state account-unconfigured"><LockKeyhole aria-hidden="true" size={28} /><div><h2>Approved instructor access required.</h2><p>This collection is limited to verified instructors.</p><a className="button button-primary" href="/instructor">Request or review access</a>{error && <p className="form-message form-error" role="alert">{error}</p>}</div></div>;

  return <div className="curated-contributions">
    <div className="curated-contributions-intro">
      <FileCheck2 aria-hidden="true" size={27} />
      <div><p className="eyebrow">Curated collection</p><h2>Materials instructors can adapt with confidence.</h2><p>Each contribution is reviewed for teaching value, relevance, attribution, sharing rights, and student privacy before publication.</p></div>
    </div>

    {resources.length > 0 ? <div className="instructor-resource-list curated-resource-list">
      {resources.map((resource) => <article key={resource.id}><div><span>Community contribution</span><h3>{resource.title}</h3><p>{resource.description}</p></div><button className="button button-secondary" type="button" disabled={downloading === resource.id} onClick={() => void downloadResource(resource)}><Download aria-hidden="true" size={17} /> {downloading === resource.id ? 'Preparing...' : 'Download'}</button></article>)}
    </div> : <div className="curated-empty"><UsersRound aria-hidden="true" size={27} /><div><h3>The collection is ready for its first contributions.</h3><p>Reviewed syllabi, assignments, rubrics, classroom activities, AE extensions, and teaching notes will appear here.</p></div></div>}

    {error && <p className="form-message form-error" role="alert">{error}</p>}

    <div className="curated-contribution-actions">
      <div><p className="eyebrow">Share and discuss</p><h2>Move a useful teaching idea forward.</h2><p>Develop an idea with instructors in the closed forum, or submit a finished resource for curation.</p></div>
      <div><a className="button button-secondary" href="/community/?category=teaching-practice"><MessageSquareText aria-hidden="true" size={16} /> Instructor forum</a><a className="button button-primary" href="https://github.com/ml4ea/ml4ea.github.io/issues/new?template=teaching-resource.yml" target="_blank" rel="noreferrer">Propose a resource <ExternalLink aria-hidden="true" size={16} /></a></div>
    </div>
  </div>;
}
