import { hasSupabaseConfig } from '@/lib/supabase/config';
import LoginForm from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <section className="auth-card">
      <p className="eyebrow">Your apartment shortlist</p>
      <h1>Sign in to Hearthstone Hub</h1>
      <p>Use a magic link or your Google account. No password needed.</p>
      {hasSupabaseConfig() ? (
        <LoginForm />
      ) : (
        <div className="notice" role="status">
          The sign-in demo is ready for the team’s Supabase project URL and publishable key.
          Add them to <code>.env.local</code> to enable it.
        </div>
      )}
      {error && <p className="error" role="alert">That sign-in link could not be verified. Please try again.</p>}
    </section>
  );
}
