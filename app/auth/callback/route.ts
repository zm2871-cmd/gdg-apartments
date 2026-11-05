import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hasSupabaseConfig } from '@/lib/supabase/config';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const destination = new URL('/account', request.url);

  if (hasSupabaseConfig() && (code || tokenHash)) {
    const supabase = await createClient();
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: 'email' });
    if (!error) return NextResponse.redirect(destination);
  }

  return NextResponse.redirect(new URL('/login?error=callback', request.url));
}
