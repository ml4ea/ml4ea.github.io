import { CheckCircle2, ExternalLink, LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { type SubmitEvent, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

export default function AccountAccess() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const requestLink = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setSubmitting(true);
    setNotice('');
    setError('');

    const redirectTo = new URL('/account/', window.location.origin).toString();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    });

    setSubmitting(false);
    if (authError) {
      setError(authError.message);
      return;
    }

    setNotice('Check your email for a secure sign-in link. The link expires automatically.');
  };

  const signOut = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setError('');
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="account-state account-unconfigured">
        <ShieldCheck aria-hidden="true" size={28} />
        <div>
          <h2>Account services are being connected.</h2>
          <p>The public portal and notebooks remain available. Instructor applications will open when the secure account service is connected.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <p className="account-loading" aria-live="polite">Checking your account…</p>;
  }

  if (session) {
    return (
      <div className="account-state account-signed-in">
        <UserRound aria-hidden="true" size={28} />
        <div>
          <p className="eyebrow">Signed in</p>
          <h2>{session.user.email}</h2>
          <p>Your email address has been verified. Instructor access requires a separate teaching-role review.</p>
          <div className="button-row">
            <a className="button button-primary" href="/instructor">Instructor workspace</a>
            <button className="button button-secondary" type="button" onClick={signOut}><LogOut aria-hidden="true" size={17} /> Sign out</button>
          </div>
          {error && <p className="form-message form-error" role="alert">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="auth-grid">
      <form className="auth-form" onSubmit={requestLink}>
        <Mail aria-hidden="true" size={27} />
        <p className="eyebrow">Email sign-in</p>
        <h2>Receive a secure sign-in link.</h2>
        <label>
          <span>Email address</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="name@university.edu" />
        </label>
        <button className="button button-primary" type="submit" disabled={submitting}>
          <Mail aria-hidden="true" size={17} /> {submitting ? 'Sending…' : 'Email me a sign-in link'}
        </button>
        <p className="form-privacy">By requesting a link, you acknowledge the <a href="/privacy">privacy notice</a>.</p>
        {notice && <p className="form-message form-success" role="status"><CheckCircle2 aria-hidden="true" size={17} /> {notice}</p>}
        {error && <p className="form-message form-error" role="alert">{error}</p>}
      </form>
      <div className="auth-explanation">
        <p className="eyebrow">Why email verification?</p>
        <h2>One account, with access based on role.</h2>
        <p>Email-link sign-in verifies ownership without requiring another password. Public resources remain open to everyone; protected teaching materials require an approved instructor application.</p>
        <a className="text-link" href="/teach">Review instructor access <ExternalLink aria-hidden="true" size={16} /></a>
      </div>
    </div>
  );
}
