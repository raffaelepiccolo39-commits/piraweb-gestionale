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
  scores?: {
    website: number;
    social: number;
    advertising: number;
    seo: number;
    content: number;
    total: number;
  };
  businessData?: {
    city?: string;
    sector?: string;
    website?: string;
    rating?: number;
    reviews?: number;
    hasInstagram?: boolean;
    hasFacebook?: boolean;
    hasTiktok?: boolean;
  };
}

function getScoreColor(score: number): string {
  if (score >= 70) return '#10B981'; // verde
  if (score >= 50) return '#F59E0B'; // giallo
  if (score >= 30) return '#F97316'; // arancione
  return '#EF4444'; // rosso
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Ottimo';
  if (score >= 60) return 'Buono';
  if (score >= 40) return 'Da migliorare';
  if (score >= 20) return 'Critico';
  return 'Assente';
}

function buildScoreBar(label: string, score: number): string {
  const color = getScoreColor(score);
  const scoreLabel = getScoreLabel(score);
  const width = Math.max(score, 5);
  return `
    <tr>
      <td style="padding:8px 0;width:120px;">
        <span style="color:#374151;font-size:13px;font-weight:600;">${label}</span>
      </td>
      <td style="padding:8px 0;width:100%;">
        <div style="background-color:#F3F4F6;border-radius:8px;height:24px;overflow:hidden;position:relative;">
          <div style="background-color:${color};height:100%;width:${width}%;border-radius:8px;"></div>
        </div>
      </td>
      <td style="padding:8px 0 8px 12px;white-space:nowrap;">
        <span style="color:${color};font-size:14px;font-weight:700;">${score}/100</span>
        <span style="color:#9CA3AF;font-size:11px;display:block;">${scoreLabel}</span>
      </td>
    </tr>`;
}

/**
 * Invia email di outreach professionale con report di analisi digitale.
 */
export async function sendOutreachEmail({ to, businessName, messageBody, subject, scores, businessData }: OutreachEmailParams) {
  const safeName = escapeHtml(businessName);
  const logoUrl = 'https://gestionale.piraweb.it/logo.png';

  // Estrai l'oggetto dal messaggio se inizia con "Oggetto: ..."
  let emailSubject = subject || '';
  let body = messageBody;

  if (!emailSubject && body.startsWith('Oggetto:')) {
    const lines = body.split('\n');
    emailSubject = lines[0].replace('Oggetto:', '').trim();
    body = lines.slice(1).join('\n').trim();
  }

  if (!emailSubject) {
    emailSubject = `Report Analisi Digitale - ${safeName}`;
  }

  // Converti il testo in paragrafi HTML
  const bodyHtml = body
    .split('\n\n')
    .map(p => `<p style="margin:0 0 14px;color:#374151;font-size:14px;line-height:1.7;">${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');

  // Sezione score (se disponibili)
  let scoreSection = '';
  if (scores) {
    const totalColor = getScoreColor(scores.total);
    scoreSection = `
          <!-- Score Report -->
          <tr>
            <td style="padding:0 40px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="padding:24px 24px 16px;">
                    <h3 style="margin:0 0 4px;color:#111827;font-size:16px;font-weight:700;">
                      Analisi Presenza Digitale
                    </h3>
                    <p style="margin:0;color:#6B7280;font-size:12px;">Report generato automaticamente da PiraWeb</p>
                  </td>
                </tr>
                <!-- Score Totale -->
                <tr>
                  <td style="padding:0 24px 20px;" align="center">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding:12px 0;">
                          <div style="width:90px;height:90px;border-radius:50%;border:4px solid ${totalColor};display:inline-block;text-align:center;line-height:82px;">
                            <span style="color:${totalColor};font-size:28px;font-weight:800;">${scores.total}</span>
                          </div>
                          <p style="margin:8px 0 0;color:#6B7280;font-size:12px;font-weight:600;">SCORE TOTALE</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Score Dettagliati -->
                <tr>
                  <td style="padding:0 24px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${buildScoreBar('Sito Web', scores.website)}
                      ${buildScoreBar('Social Media', scores.social)}
                      ${buildScoreBar('Advertising', scores.advertising)}
                      ${buildScoreBar('SEO / Google', scores.seo)}
                      ${buildScoreBar('Contenuti', scores.content)}
                    </table>
                  </td>
                </tr>
                ${businessData ? `
                <!-- Info Azienda -->
                <tr>
                  <td style="padding:0 24px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E5E7EB;padding-top:16px;">
                      <tr>
                        <td style="padding:12px 0;">
                          <span style="color:#6B7280;font-size:11px;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">Dati rilevati</span>
                        </td>
                      </tr>
                      ${businessData.website ? `<tr><td style="padding:2px 0;"><span style="color:#6B7280;font-size:12px;">Sito web:</span> <span style="color:#111827;font-size:12px;font-weight:500;">${escapeHtml(businessData.website)}</span></td></tr>` : '<tr><td style="padding:2px 0;"><span style="color:#EF4444;font-size:12px;font-weight:500;">Nessun sito web rilevato</span></td></tr>'}
                      ${businessData.rating ? `<tr><td style="padding:2px 0;"><span style="color:#6B7280;font-size:12px;">Google:</span> <span style="color:#111827;font-size:12px;font-weight:500;">&#9733; ${businessData.rating}/5 (${businessData.reviews || 0} recensioni)</span></td></tr>` : ''}
                      <tr>
                        <td style="padding:6px 0 2px;">
                          ${businessData.hasInstagram ? '<span style="display:inline-block;background:#E0E7FF;color:#4338CA;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;margin-right:4px;">Instagram &#10003;</span>' : '<span style="display:inline-block;background:#FEE2E2;color:#DC2626;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;margin-right:4px;">Instagram &#10007;</span>'}
                          ${businessData.hasFacebook ? '<span style="display:inline-block;background:#E0E7FF;color:#4338CA;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;margin-right:4px;">Facebook &#10003;</span>' : '<span style="display:inline-block;background:#FEE2E2;color:#DC2626;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;margin-right:4px;">Facebook &#10007;</span>'}
                          ${businessData.hasTiktok ? '<span style="display:inline-block;background:#E0E7FF;color:#4338CA;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;">TikTok &#10003;</span>' : ''}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ` : ''}
              </table>
            </td>
          </tr>`;
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F3F4F6;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header con logo -->
          <tr>
            <td style="background-color:#1A1A2E;padding:32px 40px;text-align:center;">
              <img src="${logoUrl}" alt="PiraWeb" width="180" style="display:inline-block;max-width:180px;height:auto;" />
            </td>
          </tr>

          <!-- Titolo Report -->
          <tr>
            <td style="padding:32px 40px 8px;">
              <p style="margin:0;color:#6B7280;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Report Analisi Digitale</p>
              <h2 style="margin:6px 0 0;color:#111827;font-size:22px;font-weight:700;">${safeName}</h2>
              ${businessData?.city ? `<p style="margin:4px 0 0;color:#9CA3AF;font-size:13px;">${escapeHtml(businessData.city)}${businessData.sector ? ' &mdash; ' + escapeHtml(businessData.sector) : ''}</p>` : ''}
            </td>
          </tr>

          <!-- Linea separatrice -->
          <tr>
            <td style="padding:16px 40px;">
              <hr style="border:none;border-top:1px solid #E5E7EB;margin:0;" />
            </td>
          </tr>

          ${scoreSection}

          <!-- Corpo messaggio -->
          <tr>
            <td style="padding:8px 40px 24px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 40px 32px;" align="center">
              <a href="https://piraweb.it" style="display:inline-block;background-color:#1A1A2E;color:#FFD700;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:0.3px;">
                Richiedi Audit Gratuito
              </a>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #E5E7EB;margin:0;" />
            </td>
          </tr>

          <!-- Firma -->
          <tr>
            <td style="padding:24px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-bottom:16px;border-bottom:2px solid #1A1A2E;">
                    <img src="${logoUrl}" alt="PiraWeb Creative Agency" width="160" style="display:block;max-width:160px;height:auto;" />
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:16px;">
                    <p style="margin:0;color:#111827;font-size:14px;font-weight:700;">Ing. Raffaele Antonio Piccolo <span style="color:#6B7280;font-weight:400;">|</span> CEO &amp; Project Manager</p>
                    <p style="margin:6px 0 0;">
                      <a href="mailto:info@piraweb.it" style="color:#2563EB;font-size:13px;text-decoration:none;">info@piraweb.it</a>
                    </p>
                    <p style="margin:4px 0 0;color:#374151;font-size:13px;">+39 331 853 5698</p>
                    <p style="margin:2px 0 0;color:#374151;font-size:13px;">+39 081 1756 0017</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;background-color:#F9FAFB;border-top:1px solid #E5E7EB;">
              <p style="margin:0 0 4px;color:#374151;font-size:12px;font-weight:600;text-align:center;">
                PiraWeb &mdash; Creative Agency
              </p>
              <p style="margin:0 0 2px;color:#9CA3AF;font-size:11px;text-align:center;">
                Sviluppo Web &bull; Marketing Digitale &bull; Social Media Management &bull; SEO &bull; Branding
              </p>
              <p style="margin:0 0 2px;color:#9CA3AF;font-size:11px;text-align:center;">
                Casapesenna (CE) &mdash; Operiamo in tutta Italia
              </p>
              <p style="margin:8px 0 0;color:#D1D5DB;font-size:10px;text-align:center;">
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
