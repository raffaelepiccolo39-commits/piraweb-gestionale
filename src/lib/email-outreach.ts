import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface OutreachEmailParams {
  to: string;
  businessName: string;
  messageBody: string;
  subject?: string;
}

/**
 * Invia email di outreach a un prospect tramite Resend.
 */
export async function sendOutreachEmail({ to, businessName, messageBody, subject }: OutreachEmailParams) {
  const safeName = escapeHtml(businessName);

  // Estrai l'oggetto dal messaggio se inizia con "Oggetto: ..."
  let emailSubject = subject || '';
  let body = messageBody;

  if (!emailSubject && body.startsWith('Oggetto:')) {
    const lines = body.split('\n');
    emailSubject = lines[0].replace('Oggetto:', '').trim();
    body = lines.slice(1).join('\n').trim();
  }

  if (!emailSubject) {
    emailSubject = `Opportunita\' digitale per ${safeName}`;
  }

  // Converti il testo in paragrafi HTML
  const bodyHtml = body
    .split('\n\n')
    .map(p => `<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');

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
            <td style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 30px 40px;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">PiraWeb</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Agenzia Web &amp; Digital Marketing</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              ${bodyHtml}

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
                <tr>
                  <td align="center" style="padding:16px 0;">
                    <a href="https://piraweb.it" style="display:inline-block;background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:12px;font-size:14px;font-weight:600;">
                      Scopri PiraWeb
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-align:center;">
                PiraWeb &mdash; Servizi Web, Marketing Digitale &amp; Social Media
              </p>
              <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
                Se non desideri ricevere altre comunicazioni, rispondi con "cancellami".
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await resend.emails.send({
    from: process.env.RESEND_FROM || 'PiraWeb <info@piraweb.it>',
    to,
    subject: emailSubject,
    html,
    text: body,
  });
}

/**
 * Genera il link WhatsApp pre-compilato con il messaggio.
 */
export function generateWhatsAppLink(phone: string, message: string): string {
  let cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');

  if (cleanPhone.startsWith('0')) {
    cleanPhone = '39' + cleanPhone.substring(1);
  }
  if (!cleanPhone.startsWith('+') && !cleanPhone.startsWith('39')) {
    cleanPhone = '39' + cleanPhone;
  }
  cleanPhone = cleanPhone.replace(/^\+/, '');

  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
}
