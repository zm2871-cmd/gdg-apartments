import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasSupabaseConfig } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  if (!hasSupabaseConfig()) redirect('/login');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect('/login');

  async function signOut() {
    'use server';
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/login');
  }

  return (
    <section className="auth-card">
      <p className="eyebrow">You’re signed in</p>
      <h1>My account</h1>
      <p className="account-email">{String(data.claims.email ?? 'Your account')}</p>
      <p>Saved apartments and personal preferences will appear here as the project grows.</p>
      <form action={signOut}>
        <button className="button secondary" type="submit">Sign out</button>
      </form>
    </section>
  );
}
