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
  if (score >= 70) return '#16A34A';
  if (score >= 50) return '#CA8A04';
  if (score >= 30) return '#EA580C';
  return '#DC2626';
}

function getScoreLabel(score: number): string {
  if (score >= 70) return 'Buono';
  if (score >= 50) return 'Sufficiente';
  if (score >= 30) return 'Da migliorare';
  return 'Critico';
}

function buildScoreRow(label: string, score: number): string {
  const color = getScoreColor(score);
  const scoreLabel = getScoreLabel(score);
  return `
                      <tr>
                        <td style="padding:6px 0;color:#555;font-size:13px;width:130px;">${label}</td>
                        <td style="padding:6px 0;">
                          <table cellpadding="0" cellspacing="0" width="100%"><tr>
                            <td style="background:#EEEEEE;border-radius:4px;height:8px;"><div style="background:${color};height:8px;width:${Math.max(score, 4)}%;border-radius:4px;"></div></td>
                          </tr></table>
                        </td>
                        <td style="padding:6px 0 6px 10px;text-align:right;white-space:nowrap;width:90px;">
                          <span style="color:${color};font-size:12px;font-weight:600;">${score}/100</span>
                          <span style="color:#999;font-size:10px;"> ${scoreLabel}</span>
                        </td>
                      </tr>`;
}

/**
 * Invia email di outreach professionale - stile consulenza, non marketing.
 */
export async function sendOutreachEmail({ to, businessName, messageBody, subject, scores, businessData }: OutreachEmailParams) {
  const safeName = escapeHtml(businessName);
  const logoEmailUrl = 'https://gestionale.piraweb.it/logo-email.png';

  let emailSubject = subject || '';
  let body = messageBody;

  if (!emailSubject && body.startsWith('Oggetto:')) {
    const lines = body.split('\n');
    emailSubject = lines[0].replace('Oggetto:', '').trim();
    body = lines.slice(1).join('\n').trim();
  }

  if (!emailSubject) {
    emailSubject = `Analisi digitale gratuita per ${safeName}`;
  }

  // Converti il testo in paragrafi HTML - stile email personale
  const bodyHtml = body
    .split('\n\n')
    .map(p => `<p style="margin:0 0 12px;color:#333;font-size:14px;line-height:1.65;">${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');

  // Sezione analisi (solo se ci sono scores)
  let analysisSection = '';
  if (scores) {
    const totalColor = getScoreColor(scores.total);

    // Problemi rilevati
    const issues: string[] = [];
    if (scores.website === 0) issues.push('Nessun sito web rilevato');
    else if (scores.website < 40) issues.push('Sito web con carenze tecniche importanti');
    if (scores.social < 30) issues.push('Presenza social assente o insufficiente');
    if (scores.advertising === 0) issues.push('Nessuna campagna pubblicitaria online attiva');
    if (scores.seo < 40) issues.push('Bassa visibilita\' sui motori di ricerca');
    if (scores.content < 30) issues.push('Contenuti digitali insufficienti');

    // Opportunita'
    const opportunities: string[] = [];
    if (scores.website < 50) opportunities.push('Un sito moderno e veloce puo\' aumentare le richieste di contatto del 40-60%');
    if (scores.social < 40) opportunities.push('Una presenza social curata porta visibilita\' gratuita ogni giorno');
    if (scores.advertising === 0) opportunities.push('Con 5-10&euro;/giorno di ADV potreste raggiungere centinaia di clienti nella vostra zona');
    if (scores.seo < 50) opportunities.push('Migliorando la SEO potreste comparire tra i primi risultati quando qualcuno cerca i vostri servizi');

    analysisSection = `
              <!-- Separatore -->
              <tr><td style="padding:20px 0 0;"><hr style="border:none;border-top:1px solid #E8E8E8;margin:0;" /></td></tr>

              <!-- Titolo Analisi -->
              <tr>
                <td style="padding:20px 0 12px;">
                  <p style="margin:0;color:#333;font-size:15px;font-weight:600;">Risultati dell'analisi</p>
                  <p style="margin:4px 0 0;color:#888;font-size:12px;">Dati raccolti automaticamente dai nostri strumenti di analisi</p>
                </td>
              </tr>

              <!-- Score Totale -->
              <tr>
                <td style="padding:0 0 16px;">
                  <table cellpadding="0" cellspacing="0" width="100%" style="background:#FAFAFA;border:1px solid #EAEAEA;border-radius:8px;">
                    <tr>
                      <td style="padding:16px 20px;" width="80" align="center">
                        <div style="width:56px;height:56px;border-radius:50%;border:3px solid ${totalColor};text-align:center;line-height:50px;">
                          <span style="color:${totalColor};font-size:20px;font-weight:700;">${scores.total}</span>
                        </div>
                      </td>
                      <td style="padding:16px 20px 16px 0;">
                        <p style="margin:0;color:#333;font-size:14px;font-weight:600;">Punteggio digitale complessivo: <span style="color:${totalColor};">${scores.total}/100</span></p>
                        <p style="margin:4px 0 0;color:#777;font-size:12px;">${scores.total < 30 ? 'La vostra presenza digitale necessita di interventi significativi.' : scores.total < 50 ? 'Ci sono margini di miglioramento importanti.' : scores.total < 70 ? 'Buona base, ma si puo\' fare di piu\'.' : 'Buona presenza digitale complessiva.'}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Dettaglio Scores -->
              <tr>
                <td style="padding:0 0 16px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    ${buildScoreRow('Sito Web', scores.website)}
                    ${buildScoreRow('Social Media', scores.social)}
                    ${buildScoreRow('Pubblicita\'', scores.advertising)}
                    ${buildScoreRow('SEO / Google', scores.seo)}
                    ${buildScoreRow('Contenuti', scores.content)}
                  </table>
                </td>
              </tr>

              ${businessData ? `
              <!-- Dati rilevati -->
              <tr>
                <td style="padding:0 0 12px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAFA;border:1px solid #EAEAEA;border-radius:8px;">
                    <tr><td style="padding:12px 16px 8px;"><span style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Dati rilevati</span></td></tr>
                    <tr><td style="padding:0 16px 4px;">
                      <span style="color:#555;font-size:12px;">Sito web: </span>
                      <span style="color:#333;font-size:12px;font-weight:500;">${businessData.website ? escapeHtml(businessData.website) : 'Non presente'}</span>
                    </td></tr>
                    ${businessData.rating ? `<tr><td style="padding:0 16px 4px;"><span style="color:#555;font-size:12px;">Google: </span><span style="color:#333;font-size:12px;font-weight:500;">${businessData.rating}/5 (${businessData.reviews || 0} recensioni)</span></td></tr>` : ''}
                    <tr><td style="padding:4px 16px 12px;">
                      ${businessData.hasInstagram ? '<span style="color:#16A34A;font-size:11px;font-weight:500;margin-right:8px;">&#10003; Instagram</span>' : '<span style="color:#DC2626;font-size:11px;font-weight:500;margin-right:8px;">&#10007; Instagram</span>'}
                      ${businessData.hasFacebook ? '<span style="color:#16A34A;font-size:11px;font-weight:500;margin-right:8px;">&#10003; Facebook</span>' : '<span style="color:#DC2626;font-size:11px;font-weight:500;margin-right:8px;">&#10007; Facebook</span>'}
                      ${businessData.hasTiktok ? '<span style="color:#16A34A;font-size:11px;font-weight:500;">&#10003; TikTok</span>' : ''}
                    </td></tr>
                  </table>
                </td>
              </tr>
              ` : ''}

              ${issues.length > 0 ? `
              <!-- Criticita' -->
              <tr>
                <td style="padding:4px 0 12px;">
                  <p style="margin:0 0 6px;color:#333;font-size:13px;font-weight:600;">Criticita\' rilevate</p>
                  ${issues.map(i => `<p style="margin:0 0 4px;color:#555;font-size:12px;line-height:1.5;">&#8226; ${i}</p>`).join('')}
                </td>
              </tr>
              ` : ''}

              ${opportunities.length > 0 ? `
              <!-- Opportunita' -->
              <tr>
                <td style="padding:4px 0 12px;">
                  <p style="margin:0 0 6px;color:#333;font-size:13px;font-weight:600;">Opportunita\' di crescita</p>
                  ${opportunities.map(o => `<p style="margin:0 0 4px;color:#555;font-size:12px;line-height:1.5;">&#8226; ${o}</p>`).join('')}
                </td>
              </tr>
              ` : ''}`;
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F5F5;padding:30px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #E5E5E5;">

          <!-- Header minimale -->
          <tr>
            <td style="padding:24px 32px;border-bottom:1px solid #EEEEEE;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <img src="${logoEmailUrl}" alt="PiraWeb" width="130" style="display:block;max-width:130px;height:auto;" />
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="color:#999;font-size:11px;">Report gratuito</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Corpo email -->
          <tr>
            <td style="padding:28px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">

              <!-- Messaggio personale -->
              <tr>
                <td style="padding:0 0 8px;">
                  ${bodyHtml}
                </td>
              </tr>

              ${analysisSection}

              <!-- Separatore prima del portfolio -->
              <tr><td style="padding:16px 0 0;"><hr style="border:none;border-top:1px solid #E8E8E8;margin:0;" /></td></tr>

              <!-- Portfolio -->
              <tr>
                <td style="padding:16px 0 0;">
                  <p style="margin:0 0 6px;color:#555;font-size:13px;line-height:1.6;">
                    Lavoriamo con aziende di diversi settori, dalla ristorazione al fashion, dall&rsquo;artigianato ai servizi professionali. Potete vedere alcuni dei nostri progetti realizzati qui:
                  </p>
                  <p style="margin:0;">
                    <a href="https://www.piraweb.it/progetti" style="color:#333;font-size:13px;font-weight:600;text-decoration:underline;">Scopri i nostri progetti &rarr;</a>
                  </p>
                </td>
              </tr>

              <!-- Invito alla consulenza -->
              <tr>
                <td style="padding:20px 0 0;">
                  <p style="margin:0 0 16px;color:#333;font-size:13px;line-height:1.6;">
                    Se volete approfondire i risultati di questa analisi, sono disponibile per una <strong>consulenza gratuita di 15 minuti</strong> in cui vi mostro nel dettaglio cosa migliorare e come. Nessun impegno, solo valore concreto per la vostra attivita\'.
                  </p>
                </td>
              </tr>
              <!-- Bottone CTA -->
              <tr>
                <td style="padding:0 0 8px;" align="center">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="background-color:#1A1A2E;border-radius:8px;">
                        <a href="https://gestionale.piraweb.it/consulenza" style="display:inline-block;padding:16px 40px;color:#FFD700;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.3px;">
                          Fissa una consulenza gratuita
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              </table>
            </td>
          </tr>

          <!-- Firma -->
          <tr>
            <td style="padding:0 32px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #EEEEEE;padding-top:20px;">
                <tr>
                  <td style="padding-bottom:12px;">
                    <img src="${logoEmailUrl}" alt="PiraWeb Creative Agency" width="140" style="display:block;max-width:140px;height:auto;" />
                  </td>
                </tr>
                <tr>
                  <td>
                    <p style="margin:0;color:#333;font-size:13px;font-weight:600;">Ing. Raffaele Antonio Piccolo</p>
                    <p style="margin:2px 0 0;color:#888;font-size:12px;">CEO &amp; Project Manager</p>
                    <p style="margin:8px 0 0;color:#555;font-size:12px;">
                      <a href="mailto:info@piraweb.it" style="color:#555;text-decoration:none;">info@piraweb.it</a> &nbsp;&bull;&nbsp;
                      +39 331 853 5698 &nbsp;&bull;&nbsp;
                      +39 081 1756 0017
                    </p>
                    <p style="margin:4px 0 0;">
                      <a href="https://www.piraweb.it" style="color:#555;font-size:12px;text-decoration:none;">piraweb.it</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background:#FAFAFA;border-top:1px solid #EEEEEE;">
              <p style="margin:0 0 4px;color:#999;font-size:10px;text-align:center;">
                <strong>Pira Web S.R.L.</strong> &mdash; P.IVA 04891370613
              </p>
              <p style="margin:0 0 4px;color:#BBB;font-size:10px;text-align:center;">
                Casapesenna (CE) &mdash; www.piraweb.it
              </p>
              <p style="margin:0;color:#CCC;font-size:9px;text-align:center;">
                Questa analisi &egrave; stata realizzata a scopo informativo.
                Se non desideri ricevere comunicazioni, rispondi con &ldquo;cancellami&rdquo;.
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
    replyTo: 'info@piraweb.it',
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
