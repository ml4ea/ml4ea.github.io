import { BookOpen, Braces, CheckCircle2, Clock3, ExternalLink, FileCheck2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

interface Entitlement {
  entitlement_role: string;
  expires_at: string | null;
}

export default function PublisherReview() {
  const [session, setSession] = useState<Session | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const load = async (activeSession: Session | null) => {
      setSession(activeSession);
      setAuthorized(false);
      setIsAdmin(false);
      if (!activeSession) { setLoading(false); return; }
      setLoading(true);
      setError('');
      const [{ data: reviewer, error: reviewerError }, { data: admin }, { data: entitlements }] = await Promise.all([
        supabase.rpc('is_publisher_reviewer'),
        supabase.rpc('is_portal_admin'),
        supabase.rpc('get_my_portal_entitlements'),
      ]);
      if (reviewerError) setError(reviewerError.message);
      setAuthorized(Boolean(reviewer || admin));
      setIsAdmin(Boolean(admin));
      const publisher = ((entitlements ?? []) as Entitlement[]).find((item) => item.entitlement_role === 'publisher_reviewer');
      setExpiresAt(publisher?.expires_at ?? null);
      setLoading(false);
    };
    supabase.auth.getSession().then(({ data }) => void load(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => window.setTimeout(() => void load(nextSession), 0));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) return <p className="account-loading">Publisher review access is being connected.</p>;
  if (loading) return <p className="account-loading" aria-live="polite">Checking publisher review access...</p>;
  if (!session) return <div className="account-state"><ShieldCheck aria-hidden="true" size={28} /><div><h2>Publisher reviewer sign-in required.</h2><p>Sign in with the exact email address invited by the portal administrator.</p><a className="button button-primary" href="/account?next=/publisher-review/">Sign in</a></div></div>;
  if (!authorized) return <div className="account-state account-unconfigured"><LockKeyhole aria-hidden="true" size={28} /><div><h2>This account does not have publisher review access.</h2><p>Review access is granted by the portal administrator to a verified account for a limited period.</p>{error && <p className="form-message form-error" role="alert">{error}</p>}</div></div>;

  return <div className="publisher-review">
    <div className="publisher-review-status"><FileCheck2 aria-hidden="true" size={27} /><div><p className="eyebrow">Protected preview</p><h2>Review workspace active.</h2><p>{isAdmin ? 'Administrator preview mode.' : expiresAt ? `Access expires ${new Date(expiresAt).toLocaleDateString()}.` : 'Time-limited reviewer access is active.'}</p></div><CheckCircle2 aria-hidden="true" size={27} /></div>

    <section className="publisher-review-scope" aria-labelledby="review-scope-heading">
      <div><p className="eyebrow">Review scope</p><h2 id="review-scope-heading">Initial portal and materials review.</h2><p>Please review presentation, rights boundaries, and proposed access paths. This preview does not authorize publication or redistribution.</p></div>
      <nav aria-label="Publisher review destinations">
        <a href="/book"><span>01</span><div><strong>Book presentation</strong><small>Bibliographic, author, and ordering information</small></div><ExternalLink aria-hidden="true" size={16} /></a>
        <a href="/application-examples"><span>02</span><div><strong>Application Example catalog</strong><small>All 56 signed-in browser notebooks</small></div><ExternalLink aria-hidden="true" size={16} /></a>
        <a href="/application-examples/view?example=svm-bearing-fault-classification"><span>03</span><div><strong>Complete Application Examples</strong><small>Executed code and outputs with controlled Colab and download access</small></div><Braces aria-hidden="true" size={17} /></a>
        <a href="/instructor/manual/"><span>04</span><div><strong>Online instructor’s manual</strong><small>Protected browser preview; PDF download is withheld</small></div><BookOpen aria-hidden="true" size={17} /></a>
        <a href="/updates/"><span>05</span><div><strong>Updates and errata</strong><small>Proposed public correction and update channel</small></div><ExternalLink aria-hidden="true" size={16} /></a>
      </nav>
    </section>

    <section className="publisher-permission-checklist" aria-labelledby="permission-checklist-heading">
      <div><p className="eyebrow">Written guidance requested</p><h2 id="permission-checklist-heading">Permission checklist.</h2></div>
      <ul>
        <li><CheckCircle2 aria-hidden="true" size={18} /><span>Public operation of the companion portal and its book catalog.</span></li>
        <li><CheckCircle2 aria-hidden="true" size={18} /><span>Protected online and downloadable editions of the instructor’s manual.</span></li>
        <li><CheckCircle2 aria-hidden="true" size={18} /><span>Distribution of Application Example notebooks to verified book owners and instructors.</span></li>
        <li><CheckCircle2 aria-hidden="true" size={18} /><span>Permitted use of book excerpts, figures, cover art, and Springer branding.</span></li>
        <li><CheckCircle2 aria-hidden="true" size={18} /><span>Acceptable purchaser-verification and institutional-access procedures.</span></li>
      </ul>
    </section>

    <aside className="publisher-review-boundary"><Clock3 aria-hidden="true" size={22} /><p><strong>Prelaunch boundary:</strong> All Application Examples are available through verified-account browser, Colab, and download workflows. The private repository, manual PDF downloads, instructor discussions, teaching contributions, and administrator functions remain outside publisher-review access.</p></aside>
  </div>;
}
