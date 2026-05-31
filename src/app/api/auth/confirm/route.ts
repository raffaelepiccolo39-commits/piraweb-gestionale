export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * Conferma magic link / invite / recovery / signup generati lato admin
 * (auth.admin.generateLink → properties.hashed_token).
 *
 * Atteso URL: /api/auth/confirm?token_hash=XXX&type=magiclink&next=/onboarding
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  let next = searchParams.get('next') ?? '/dashboard';
  if (!next.startsWith('/') || next.startsWith('//')) {
    next = '/dashboard';
  }

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/login?error=invalid_link`);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
