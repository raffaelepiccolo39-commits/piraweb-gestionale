import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Cancella il cookie 2fa_verified al logout
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete('2fa_verified');

  return NextResponse.json({ success: true });
}
