import nodemailer from 'nodemailer';

/**
 * Email per reimpostare la password.
 *
 * Vale sia per il team sia per i clienti del portale: il messaggio non
 * nomina né ruoli né aree, perché chi la riceve può essere l'uno o l'altro
 * e a questo punto non lo sappiamo ancora (e non serve saperlo).
 */

const smtpPort = Number(process.env.SMTP_PORT) || 465;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendPasswordResetEmail({ to, resetLink }: { to: string; resetLink: string }) {
  const appBase = process.env.NEXT_PUBLIC_APP_URL || 'https://gestionale.piraweb.it';
  const logoUrl = `${appBase}/logo-dark.png`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F5F5F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F5F4;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(10,38,58,0.08);border:1px solid #E5E7EB;">

        <tr><td style="height:4px;background-color:#D4A800;font-size:0;line-height:0;">&nbsp;</td></tr>

        <tr><td style="padding:32px 40px 0;" align="center">
          <img src="${logoUrl}" alt="Pira Web" width="140" style="display:block;border:0;">
        </td></tr>

        <tr><td style="padding:28px 40px 8px;">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0A263A;">Reimposta la password</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4B5563;">
            Hai chiesto di reimpostare la password. Clicca qui sotto e scegline una nuova:
            il link vale un'ora e funziona una volta sola.
          </p>
        </td></tr>

        <tr><td style="padding:0 40px 32px;" align="center">
          <a href="${resetLink}"
             style="display:inline-block;background-color:#0A263A;color:#ffffff;text-decoration:none;
                    padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">
            Scegli una nuova password
          </a>
          <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#9CA3AF;">
            Se il pulsante non funziona, copia questo indirizzo nel browser:<br>
            <span style="color:#6B7280;word-break:break-all;">${resetLink}</span>
          </p>
        </td></tr>

        <tr><td style="padding:20px 40px;background-color:#FAFAF9;border-top:1px solid #E5E7EB;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#9CA3AF;">
            Se non sei stato tu a chiederlo puoi ignorare questo messaggio: la password
            attuale resta valida e nessuno vi ha avuto accesso.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'Reimposta la tua password',
    html,
  });
}
