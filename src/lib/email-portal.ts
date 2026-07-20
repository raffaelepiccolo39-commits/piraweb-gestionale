import nodemailer from 'nodemailer';

/**
 * Email di invito al portale clienti.
 *
 * Separata da email.ts (inviti dipendenti) perché parla a un pubblico
 * diverso: niente ruoli interni, tono da fornitore verso cliente.
 * Stessa infrastruttura SMTP.
 */

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

interface PortalInviteParams {
  to: string;
  fullName: string;
  /** Nome dell'azienda cliente, per far capire di quale profilo si parla */
  clientName: string;
  inviteLink: string;
}

export async function sendPortalInviteEmail({ to, fullName, clientName, inviteLink }: PortalInviteParams) {
  const firstName = escapeHtml((fullName || '').split(' ')[0] || '');
  const safeClient = escapeHtml(clientName);
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

          <tr><td style="height:4px;background-color:#D4A800;font-size:0;line-height:0;">&nbsp;</td></tr>

          <tr>
            <td style="padding:32px 40px 0;" align="center">
              <img src="${logoUrl}" alt="Pira Web" width="140" style="display:block;border:0;">
            </td>
          </tr>

          <tr>
            <td style="padding:28px 40px 8px;">
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0A263A;">
                ${firstName ? `Ciao ${firstName},` : 'Ciao,'} il tuo spazio è pronto
              </h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4B5563;">
                Abbiamo preparato un'area riservata per <strong style="color:#0A263A;">${safeClient}</strong>.
                Da lì puoi vedere i contenuti che abbiamo programmato per il tuo profilo,
                approvarli e tenere sott'occhio lo stato del rapporto con noi.
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4B5563;">
                Al primo accesso ti verrà chiesto di scegliere una password.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 32px;" align="center">
              <a href="${inviteLink}"
                 style="display:inline-block;background-color:#0A263A;color:#ffffff;text-decoration:none;
                        padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">
                Entra nel tuo spazio
              </a>
              <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#9CA3AF;">
                Se il pulsante non funziona, copia questo indirizzo nel browser:<br>
                <span style="color:#6B7280;word-break:break-all;">${inviteLink}</span>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 40px;background-color:#FAFAF9;border-top:1px solid #E5E7EB;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#9CA3AF;">
                Hai ricevuto questa email perché siamo noi a curare la tua comunicazione.
                Se pensi si tratti di un errore, rispondi pure a questo messaggio.
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
    subject: `Il tuo spazio riservato — ${clientName}`,
    html,
  });
}

interface PortalDigestParams {
  to: string;
  fullName: string | null;
  clientName: string;
  /** Quanti contenuti aspettano una risposta */
  pending: number;
  portalLink: string;
}

/**
 * Riepilogo: "ci sono N contenuti da guardare".
 *
 * Volutamente senza le anteprime dei contenuti: l'email serve a far entrare
 * nel portale, non a sostituirlo. Se il cliente potesse valutare tutto da
 * qui, l'approvazione tornerebbe a essere uno scambio di email — cioè il
 * problema che il portale doveva risolvere.
 */
export async function sendPortalDigestEmail({ to, fullName, clientName, pending, portalLink }: PortalDigestParams) {
  const firstName = escapeHtml((fullName || '').split(' ')[0] || '');
  const safeClient = escapeHtml(clientName);
  const appBase = process.env.NEXT_PUBLIC_APP_URL || 'https://gestionale.piraweb.it';
  const logoUrl = `${appBase}/logo-dark.png`;

  const quanti = pending === 1
    ? 'C’è <strong>un nuovo contenuto</strong> che aspetta un tuo parere'
    : `Ci sono <strong>${pending} nuovi contenuti</strong> che aspettano un tuo parere`;

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
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0A263A;">
            ${firstName ? `${firstName}, c’è qualcosa da vedere` : 'C’è qualcosa da vedere'}
          </h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4B5563;">
            ${quanti} nel piano editoriale di <strong style="color:#0A263A;">${safeClient}</strong>.
            Dai un’occhiata quando hai un minuto: puoi approvarli o dirci cosa cambiare.
          </p>
        </td></tr>

        <tr><td style="padding:0 40px 32px;" align="center">
          <a href="${portalLink}"
             style="display:inline-block;background-color:#0A263A;color:#ffffff;text-decoration:none;
                    padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">
            Guarda i contenuti
          </a>
        </td></tr>

        <tr><td style="padding:20px 40px;background-color:#FAFAF9;border-top:1px solid #E5E7EB;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#9CA3AF;">
            Ti scriviamo solo quando c’è materiale nuovo, mai due volte per le stesse cose.
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
    subject: pending === 1
      ? `Un contenuto ti aspetta — ${clientName}`
      : `${pending} contenuti ti aspettano — ${clientName}`,
    html,
  });
}
