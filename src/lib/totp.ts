import * as OTPAuth from 'otpauth';

const ISSUER = 'PiraWeb Gestionale';

export function generateTOTPSecret(email: string) {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });

  return {
    secret: totp.secret.base32,
    uri: totp.toString(),
  };
}

export function verifyTOTPCode(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  // window: 1 = accetta codici del periodo precedente/successivo (30s tolleranza)
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}
