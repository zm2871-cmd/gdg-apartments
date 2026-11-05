'use client';

import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setMessage('Check your email for a sign-in link.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the link. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start Google sign-in.');
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={sendMagicLink}>
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          disabled={busy}
        />
        <button className="button full" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : 'Email me a sign-in link'}
        </button>
      </form>
      <div className="divider"><span>or</span></div>
      <button className="button secondary full" type="button" onClick={signInWithGoogle} disabled={busy}>
        Continue with Google
      </button>
      {message && <p className="success" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
