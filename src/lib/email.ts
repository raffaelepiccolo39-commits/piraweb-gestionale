import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface WelcomeEmailParams {
  to: string;
  fullName: string;
  email: string;
  password: string;
  role: string;
  appUrl: string;
}

const roleLabels: Record<string, string> = {
  admin: 'Amministratore',
  social_media_manager: 'Social Media Manager',
  content_creator: 'Content Creator',
  graphic_social: 'Graphic Social',
  graphic_brand: 'Graphic Brand',
};

export async function sendWelcomeEmail({ to, fullName, email, password, role, appUrl }: WelcomeEmailParams) {
  const roleLabel = roleLabels[role] || role;
  const firstName = fullName.split(' ')[0];

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 40px 40px 30px;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;">PiraWeb</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Gestionale Interno</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:600;">
                Benvenuto/a, ${firstName}! 🎉
              </h2>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
                Il tuo account sul gestionale PiraWeb è stato creato. Ecco i tuoi dati di accesso:
              </p>

              <!-- Credentials Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;width:100px;">Email</td>
                        <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;">${email}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;">Password</td>
                        <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;font-family:monospace;">${password}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;">Ruolo</td>
                        <td style="padding:6px 0;">
                          <span style="display:inline-block;background-color:#EEF2FF;color:#4F46E5;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:600;">
                            ${roleLabel}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:24px;">
                    <a href="${appUrl}/login" style="display:inline-block;background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:600;">
                      Accedi al Gestionale
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.5;">
                Ti consigliamo di cambiare la password al primo accesso dalle Impostazioni del tuo profilo.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
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
    subject: `Benvenuto/a in PiraWeb Gestionale, ${firstName}!`,
    html,
  });
}
