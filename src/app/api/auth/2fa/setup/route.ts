import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateTOTPSecret } from '@/lib/totp';
import QRCode from 'qrcode';

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  // Genera un nuovo secret TOTP
  const { secret, uri } = generateTOTPSecret(user.email || user.id);

  // Genera QR code come data URL
  const qrCodeDataUrl = await QRCode.toDataURL(uri, {
    width: 256,
    margin: 2,
    color: { dark: '#ffffff', light: '#00000000' },
  });

  // Salva il secret (non ancora abilitato) usando service role per bypassare RLS
  const serviceClient = await createServiceRoleClient();
  const { error } = await serviceClient
    .from('user_totp')
    .upsert({
      user_id: user.id,
      secret,
      enabled: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) {
    return NextResponse.json({ error: 'Errore nel salvataggio' }, { status: 500 });
  }

  return NextResponse.json({
    qrCode: qrCodeDataUrl,
    secret, // mostrato come backup per inserimento manuale
    uri,
  });
}
