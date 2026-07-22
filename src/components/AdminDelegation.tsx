import { CheckCircle2, KeyRound, LockKeyhole, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SyntheticEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

interface DelegateRecord {
  delegate_user_id: string;
  delegate_email: string;
  appointed_at: string;
  updated_at: string;
}

export default function AdminDelegation() {
  const [session, setSession] = useState<Session | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [delegate, setDelegate] = useState<DelegateRecord | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadDelegation = async (activeSession: Session | null) => {
    const supabase = getSupabaseClient();
    setSession(activeSession);
    setDelegate(null);
    if (!supabase || !activeSession) { setIsOwner(false); setLoading(false); return; }
    setLoading(true); setError('');
    const { data: owner, error: ownerError } = await supabase.rpc('is_portal_owner');
    if (ownerError || !owner) {
      setIsOwner(false);
      setError(ownerError?.message ?? 'Portal owner access is required.');
      setLoading(false);
      return;
    }
    setIsOwner(true);
    const { data, error: delegateError } = await supabase.rpc('get_portal_delegate');
    if (delegateError) setError(delegateError.message);
    setDelegate(((data ?? [])[0] as DelegateRecord | undefined) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => void loadDelegation(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => window.setTimeout(() => void loadDelegation(nextSession), 0));
    return () => listener.subscription.unsubscribe();
  }, []);

  const appoint = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSaving(true); setNotice(''); setError('');
    const { data, error: appointError } = await supabase.rpc('set_portal_delegate', { p_email: email.trim() });
    if (appointError) setError(appointError.message);
    else {
      setDelegate(((data ?? [])[0] as DelegateRecord | undefined) ?? null);
      setEmail('');
      setNotice('Delegated administrator appointed. Access takes effect immediately.');
    }
    setSaving(false);
  };

  const revoke = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !delegate) return;
    if (!window.confirm(`Revoke administrator access for ${delegate.delegate_email}?`)) return;
    setSaving(true); setNotice(''); setError('');
    const { error: revokeError } = await supabase.rpc('remove_portal_delegate');
    if (revokeError) setError(revokeError.message);
    else {
      setDelegate(null);
      setNotice('Delegated administrator access revoked.');
    }
    setSaving(false);
  };

  if (!isSupabaseConfigured) return <p className="account-loading">Supabase is not configured.</p>;
  if (loading) return <p className="account-loading" aria-live="polite">Checking owner access...</p>;
  if (!session) return <div className="account-state"><ShieldCheck aria-hidden="true" size={28} /><div><h2>Portal owner sign-in required.</h2><p>Sign in with the permanent owner account to manage delegation.</p><a className="button button-primary" href="/account?next=/admin/delegation/">Sign in</a></div></div>;
  if (!isOwner) return <div className="account-state account-unconfigured"><LockKeyhole aria-hidden="true" size={28} /><div><h2>This page is reserved for the portal owner.</h2><p>Delegated administrators cannot appoint, replace, or revoke administrators.</p>{error && <p className="form-message form-error" role="alert">{error}</p>}</div></div>;

  return <div className="admin-delegation">
    <div className="catalog-status"><p>Permanent owner: <strong>yjin@usc.edu</strong></p><a className="text-link" href="/admin/">Administrator dashboard</a></div>
    {notice && <p className="form-message form-success" role="status">{notice}</p>}

    <section className="admin-delegate-current" aria-labelledby="current-delegate-heading">
      <KeyRound aria-hidden="true" size={26} />
      <div>
        <p className="eyebrow">Current assignment</p>
        <h2 id="current-delegate-heading">{delegate ? delegate.delegate_email : 'No delegated administrator.'}</h2>
        <p>{delegate ? `Appointed ${new Date(delegate.appointed_at).toLocaleDateString()}. This account can review requests and moderate discussions.` : 'The permanent owner currently handles all administrator work.'}</p>
      </div>
      {delegate ? <button className="button button-secondary" type="button" disabled={saving} onClick={() => void revoke()}><Trash2 aria-hidden="true" size={17} /> Revoke access</button> : <CheckCircle2 aria-hidden="true" size={27} />}
    </section>

    <form className="admin-delegate-form" onSubmit={appoint}>
      <div><UserPlus aria-hidden="true" size={25} /><div><p className="eyebrow">Owner-only control</p><h2>{delegate ? 'Replace the delegate.' : 'Appoint a delegate.'}</h2><p>The person must first sign in to ML4EA and verify the email address. A new appointment replaces the current delegate immediately.</p></div></div>
      <label><span>Delegate account email</span><input type="email" required autoComplete="email" placeholder="name@university.edu" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <button className="button button-primary" type="submit" disabled={saving}><UserPlus aria-hidden="true" size={17} /> {saving ? 'Saving...' : delegate ? 'Replace delegate' : 'Appoint delegate'}</button>
    </form>

    <aside className="admin-delegate-boundary"><ShieldCheck aria-hidden="true" size={21} /><p><strong>The owner remains in control.</strong> A delegate can process instructor requests, send decision emails, moderate discussions, and use protected administrator tools. Only <strong>yjin@usc.edu</strong> can manage this assignment or future security settings.</p></aside>
    {error && <p className="form-message form-error" role="alert">{error}</p>}
  </div>;
}
