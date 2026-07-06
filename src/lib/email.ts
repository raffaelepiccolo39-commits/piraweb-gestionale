import nodemailer from 'nodemailer';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

interface InviteEmailParams {
  to: string;
  fullName: string;
  role: string;
  inviteLink: string;
}

const roleLabels: Record<string, string> = {
  admin: 'Amministratore',
  social_media_manager: 'Social Media Manager',
  content_creator: 'Content Creator',
  graphic_social: 'Graphic Social',
  graphic_brand: 'Graphic Brand',
};

export async function sendInviteEmail({ to, fullName, role, inviteLink }: InviteEmailParams) {
  const roleLabel = escapeHtml(roleLabels[role] || role);
  const firstName = escapeHtml(fullName.split(' ')[0]);
  const safeEmail = escapeHtml(to);
  const appBase = process.env.NEXT_PUBLIC_APP_URL || 'https://gestionale.piraweb.it';
  const logoUrl = `${appBase}/logo-dark.png`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#F5F5F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F5F4;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(10,38,58,0.08);border:1px solid #E5E7EB;">

          <!-- Filo oro brand -->
          <tr><td style="height:4px;background-color:#D4A800;font-size:0;line-height:0;">&nbsp;</td></tr>

          <!-- Header con logo Pira -->
          <tr>
            <td align="center" style="background-color:#ffffff;padding:36px 40px 28px;border-bottom:1px solid #F0F2F5;">
              <img src="${logoUrl}" alt="PiraWeb" width="190" style="display:block;width:190px;max-width:60%;height:auto;border:0;" />
              <p style="margin:16px 0 0;color:#6B7280;font-size:13px;letter-spacing:0.02em;">Gestionale Interno</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 8px;color:#0B1F2F;font-size:22px;font-weight:600;">
                Sei stato invitato/a, ${firstName}!
              </h2>
              <p style="margin:0 0 24px;color:#4B5563;font-size:15px;line-height:1.6;">
                L'amministratore ti ha invitato/a sul gestionale PiraWeb con il ruolo di
                <span style="display:inline-block;background-color:#FBF3D6;color:#8A6D00;padding:2px 10px;border-radius:6px;font-size:13px;font-weight:600;">
                  ${roleLabel}
                </span>.
              </p>

              <!-- Info Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;width:100px;">Email</td>
                        <td style="padding:6px 0;color:#0B1F2F;font-size:14px;font-weight:600;">${safeEmail}</td>
                      </tr>
                    </table>
                    <p style="margin:16px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">
                      Clicca il pulsante qui sotto per impostare la tua password e accedere al gestionale.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:24px;">
                    <a href="${inviteLink}" style="display:inline-block;background-color:#0A263A;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:600;">
                      Imposta Password e Accedi
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.5;">
                Se non hai richiesto questo account, puoi ignorare questa email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background-color:#F5F5F4;border-top:1px solid #E5E7EB;">
              <p style="margin:0;color:#9CA3AF;font-size:12px;text-align:center;">
                PiraWeb Gestionale &copy; ${new Date().getFullYear()} — Questa è un'email automatica, non rispondere.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: `Sei stato invitato/a in PiraWeb Gestionale, ${firstName}`,
    html,
  });
}
