import { CheckCircle2, ExternalLink, LogOut, Mail, ShieldAlert, ShieldCheck, UserRound } from 'lucide-react';
import { type SubmitEvent, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { institutionalEmailMessage, usesPersonalEmailProvider } from '../lib/emailEligibility';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

const EMAIL_OTP_LENGTH = 8;

const getReturnPath = () => {
  if (typeof window === 'undefined') return null;
  const next = new URLSearchParams(window.location.search).get('next');
  return next?.startsWith('/') && !next.startsWith('//') ? next : null;
};

const isInstructorApplicationRequest = () => getReturnPath() === '/instructor';

export default function AccountAccess() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      const returnPath = getReturnPath();
      if (data.session && returnPath) window.location.replace(returnPath);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      const returnPath = getReturnPath();
      if (nextSession && returnPath) window.location.replace(returnPath);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const requestCode = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setNotice('');
    setError('');
    if (isInstructorApplicationRequest() && usesPersonalEmailProvider(email)) {
      setError(institutionalEmailMessage);
      return;
    }

    setSubmitting(true);
    const returnPath = getReturnPath();
    const callbackUrl = new URL('/account/', window.location.origin);
    if (returnPath) callbackUrl.searchParams.set('next', returnPath);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl.toString(), shouldCreateUser: true },
    });

    setSubmitting(false);
    if (authError) {
      setError(authError.message);
      return;
    }

    setPendingEmail(email.trim());
    setCode('');
    setNotice('Enter the eight-digit code from the newest email. Requesting another code replaces the previous one.');
  };

  const verifyCode = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setVerifying(true);
    setError('');
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: pendingEmail,
      token: code.trim(),
      type: 'email',
    });
    setVerifying(false);

    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    setSession(data.session);
    const returnPath = getReturnPath();
    if (data.session && returnPath) window.location.replace(returnPath);
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
          <p>The prelaunch portal remains available for review. Instructor applications will open when the secure account service is connected.</p>
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

  if (pendingEmail) {
    return (
      <div className="auth-grid">
        <form className="auth-form" onSubmit={verifyCode}>
          <ShieldCheck aria-hidden="true" size={27} />
          <p className="eyebrow">Verification code</p>
          <h2>Enter the code from your email.</h2>
          <p>Code sent to <strong>{pendingEmail}</strong>.</p>
          <label>
            <span>Eight-digit code</span>
            <input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, EMAIL_OTP_LENGTH))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern={`[0-9]{${EMAIL_OTP_LENGTH}}`}
              maxLength={EMAIL_OTP_LENGTH}
              required
              placeholder="00000000"
            />
          </label>
          <button className="button button-primary" type="submit" disabled={verifying || code.length !== EMAIL_OTP_LENGTH}>
            <CheckCircle2 aria-hidden="true" size={17} /> {verifying ? 'Verifying…' : 'Verify and sign in'}
          </button>
          <button className="button button-secondary" type="button" onClick={() => { setPendingEmail(''); setCode(''); setNotice(''); setError(''); }}>
            Use another email
          </button>
          {notice && <p className="form-message form-success" role="status"><CheckCircle2 aria-hidden="true" size={17} /> {notice}</p>}
          {error && <p className="form-message form-error" role="alert">{error}</p>}
        </form>
        <div className="auth-explanation">
          <p className="eyebrow">Institutional email</p>
          <h2>No email link required.</h2>
          <p>Enter the code shown in the newest ML4EA email. This avoids interference from institutional link-scanning systems.</p>
        </div>
      </div>
    );
  }

  const personalEmailBlocked = isInstructorApplicationRequest() && usesPersonalEmailProvider(email);

  return (
    <div className="auth-grid">
      <form className="auth-form" onSubmit={requestCode}>
        <Mail aria-hidden="true" size={27} />
        <p className="eyebrow">Email sign-in</p>
        <h2>Receive a secure sign-in code.</h2>
        <label>
          <span>Email address</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="name@university.edu" />
        </label>
        {personalEmailBlocked && <p className="form-message form-error" role="alert"><ShieldAlert aria-hidden="true" size={19} /> {institutionalEmailMessage}</p>}
        <button className="button button-primary" type="submit" disabled={submitting || personalEmailBlocked}>
          <Mail aria-hidden="true" size={17} /> {submitting ? 'Sending…' : 'Email me a sign-in code'}
        </button>
        <p className="form-privacy">By requesting a code, you acknowledge the <a href="/privacy">privacy notice</a>.</p>
        {notice && <p className="form-message form-success" role="status"><CheckCircle2 aria-hidden="true" size={17} /> {notice}</p>}
        {error && <p className="form-message form-error" role="alert">{error}</p>}
      </form>
      <div className="auth-explanation">
        <p className="eyebrow">Why email verification?</p>
        <h2>One account, with access based on role.</h2>
        <p>Email-code sign-in verifies ownership without requiring another password. Public resources remain open to everyone; protected teaching materials require an approved instructor application.</p>
        <a className="text-link" href="/teach">Review instructor access <ExternalLink aria-hidden="true" size={16} /></a>
      </div>
    </div>
  );
}
