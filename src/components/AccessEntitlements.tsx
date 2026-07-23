import { BookKey, CheckCircle2, Clock3, KeyRound, LockKeyhole, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { type SubmitEvent, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

interface Entitlement {
  entitlement_id: number;
  entitlement_user_id: string;
  entitlement_email: string;
  entitlement_role: 'publisher_reviewer' | 'book_owner';
  entitlement_status: 'active' | 'revoked';
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

const defaultExpiration = () => {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
};

export default function AccessEntitlements() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [email, setEmail] = useState('');
  const [expiresOn, setExpiresOn] = useState(defaultExpiration);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadEntitlements = async (activeSession: Session | null) => {
    const supabase = getSupabaseClient();
    setSession(activeSession);
    setEntitlements([]);
    if (!supabase || !activeSession) { setIsAdmin(false); setLoading(false); return; }
    setLoading(true);
    setError('');
    const { data: admin, error: adminError } = await supabase.rpc('is_portal_admin');
    if (adminError || !admin) {
      setIsAdmin(false);
      setError(adminError?.message ?? 'Portal administrator access is required.');
      setLoading(false);
      return;
    }
    setIsAdmin(true);
    const { data, error: entitlementError } = await supabase.rpc('get_portal_access_entitlements');
    if (entitlementError) setError(entitlementError.message);
    setEntitlements((data ?? []) as Entitlement[]);
    setLoading(false);
  };

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => void loadEntitlements(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => window.setTimeout(() => void loadEntitlements(nextSession), 0));
    return () => listener.subscription.unsubscribe();
  }, []);

  const grant = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSaving(true);
    setNotice('');
    setError('');
    const expiration = new Date(`${expiresOn}T23:59:59`);
    const { data, error: grantError } = await supabase.rpc('grant_portal_access_entitlement', {
      p_email: email.trim(),
      p_role: 'publisher_reviewer',
      p_expires_at: expiration.toISOString(),
    });
    if (grantError) setError(grantError.message);
    else {
      setEntitlements((data ?? []) as Entitlement[]);
      setEmail('');
      setExpiresOn(defaultExpiration());
      setNotice('Publisher review access granted. Access takes effect immediately.');
    }
    setSaving(false);
  };

  const revoke = async (entitlement: Entitlement) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!window.confirm(`Revoke publisher review access for ${entitlement.entitlement_email}?`)) return;
    setSaving(true);
    setNotice('');
    setError('');
    const { data, error: revokeError } = await supabase.rpc('revoke_portal_access_entitlement', {
      p_entitlement_id: entitlement.entitlement_id,
    });
    if (revokeError) setError(revokeError.message);
    else {
      setEntitlements((data ?? []) as Entitlement[]);
      setNotice('Publisher review access revoked immediately.');
    }
    setSaving(false);
  };

  if (!isSupabaseConfigured) return <p className="account-loading">Supabase is not configured.</p>;
  if (loading) return <p className="account-loading" aria-live="polite">Checking entitlement administration...</p>;
  if (!session) return <div className="account-state"><ShieldCheck aria-hidden="true" size={28} /><div><h2>Administrator sign-in required.</h2><p>Sign in with the owner or delegated administrator account.</p><a className="button button-primary" href="/account?next=/admin/access/">Sign in</a></div></div>;
  if (!isAdmin) return <div className="account-state account-unconfigured"><LockKeyhole aria-hidden="true" size={28} /><div><h2>This account is not a portal administrator.</h2><p>Only an authorized administrator can manage review entitlements.</p>{error && <p className="form-message form-error" role="alert">{error}</p>}</div></div>;

  const publisherEntitlements = entitlements.filter((item) => item.entitlement_role === 'publisher_reviewer');

  return <div className="access-entitlements">
    {notice && <p className="form-message form-success" role="status">{notice}</p>}

    <form className="entitlement-grant-form" onSubmit={grant}>
      <div><UserPlus aria-hidden="true" size={25} /><div><p className="eyebrow">Time-limited access</p><h2>Invite a publisher reviewer.</h2><p>The reviewer must first sign in and verify this exact email address. Access expires automatically and can be revoked sooner.</p></div></div>
      <label><span>Reviewer account email</span><input type="email" required autoComplete="email" placeholder="name@publisher.com" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label><span>Access expires</span><input type="date" required min={new Date().toISOString().slice(0, 10)} value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></label>
      <button className="button button-primary" type="submit" disabled={saving}><KeyRound aria-hidden="true" size={17} /> {saving ? 'Granting...' : 'Grant review access'}</button>
    </form>

    <section className="entitlement-list" aria-labelledby="publisher-access-heading">
      <div><p className="eyebrow">Publisher review</p><h2 id="publisher-access-heading">Review access history.</h2></div>
      {publisherEntitlements.length === 0 ? <div className="admin-empty"><CheckCircle2 aria-hidden="true" size={27} /><div><h2>No reviewer accounts have been granted.</h2><p>Use the form above after the reviewer has signed in once.</p></div></div> : <ol>
        {publisherEntitlements.map((entitlement) => {
          const active = entitlement.entitlement_status === 'active' && (!entitlement.expires_at || new Date(entitlement.expires_at) > new Date());
          return <li key={entitlement.entitlement_id}>
            <BookKey aria-hidden="true" size={24} />
            <div><p className="eyebrow">{active ? 'Active' : entitlement.entitlement_status === 'revoked' ? 'Revoked' : 'Expired'}</p><h3>{entitlement.entitlement_email}</h3><p>Granted {new Date(entitlement.granted_at).toLocaleDateString()}{entitlement.expires_at ? ` · Expires ${new Date(entitlement.expires_at).toLocaleDateString()}` : ''}</p></div>
            {active && <button className="button button-secondary" type="button" disabled={saving} onClick={() => void revoke(entitlement)}><Trash2 aria-hidden="true" size={17} /> Revoke</button>}
          </li>;
        })}
      </ol>}
    </section>

    <aside className="entitlement-dormant"><Clock3 aria-hidden="true" size={23} /><div><p className="eyebrow">Prepared, not activated</p><h2>Verified book-owner access remains dormant.</h2><p>The entitlement type and identity checks are ready, but the database rejects every book-owner grant until written publisher permission and an approved verification procedure are in place.</p></div></aside>
    {error && <p className="form-message form-error" role="alert">{error}</p>}
  </div>;
}
