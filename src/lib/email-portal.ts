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
                Al primo accesso sceglierai la tua password. Questo link funziona una volta sola,
                quindi usalo appena puoi.
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
  /** Post del piano editoriale in attesa di risposta */
  pendingPost: number;
  /** Piani scatti, script e idee video in attesa di risposta */
  pendingMateriali: number;
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
export async function sendPortalDigestEmail({ to, fullName, clientName, pendingPost, pendingMateriali, portalLink }: PortalDigestParams) {
  const totale = pendingPost + pendingMateriali;
  const firstName = escapeHtml((fullName || '').split(' ')[0] || '');
  const safeClient = escapeHtml(clientName);
  const appBase = process.env.NEXT_PUBLIC_APP_URL || 'https://gestionale.piraweb.it';
  const logoUrl = `${appBase}/logo-dark.png`;

  // Si nominano le cose per quello che sono: "3 contenuti" quando il cliente
  // trova due post e un piano scatti sarebbe una mezza verita, e lui apre il
  // portale cercando la cosa sbagliata.
  const pezzi: string[] = [];
  if (pendingPost > 0) {
    pezzi.push(pendingPost === 1 ? '<strong>un contenuto</strong> del piano editoriale' : `<strong>${pendingPost} contenuti</strong> del piano editoriale`);
  }
  if (pendingMateriali > 0) {
    pezzi.push(pendingMateriali === 1 ? '<strong>un documento</strong> (piano scatti, script o idee video)' : `<strong>${pendingMateriali} documenti</strong> fra piani scatti, script e idee video`);
  }
  const quanti = totale === 1
    ? `C’è ${pezzi[0]} che aspetta un tuo parere`
    : `Ci sono ${pezzi.join(' e ')} che aspettano un tuo parere`;

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
    subject: totale === 1
      ? `Qualcosa ti aspetta — ${clientName}`
      : `${totale} cose ti aspettano — ${clientName}`,
    html,
  });
}

interface ShootingPromemoriaParams {
  to: string;
  fullName: string | null;
  clientName: string;
  /** Fino a quando è coperto il piano editoriale */
  copertoFino: string;
  portalLink: string;
}

/**
 * "Il piano editoriale sta per finire, fissiamo lo shooting."
 *
 * Parte 15 giorni prima della scadenza. Prima esisteva solo l'avviso
 * interno al team: il cliente non sapeva nulla e toccava a qualcuno
 * ricordarsi di scrivergli — cioè, in pratica, ci si arrivava tardi.
 *
 * Porta dritto alla pagina dove sceglie il giorno, invece di aprire uno
 * scambio di email per trovare una data.
 */
export async function sendShootingPromemoriaEmail({ to, fullName, clientName, copertoFino, portalLink }: ShootingPromemoriaParams) {
  const firstName = escapeHtml((fullName || '').split(' ')[0] || '');
  const safeClient = escapeHtml(clientName);
  const appBase = process.env.NEXT_PUBLIC_APP_URL || 'https://gestionale.piraweb.it';
  const logoUrl = `${appBase}/logo-dark.png`;
  const quando = new Date(copertoFino + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });

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
            ${firstName ? `${firstName}, ` : ''}fissiamo il prossimo shooting?
          </h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4B5563;">
            I contenuti programmati per <strong style="color:#0A263A;">${safeClient}</strong>
            arrivano fino al <strong style="color:#0A263A;">${quando}</strong>. Per non lasciare
            buchi nel profilo conviene girare il materiale nuovo con un po' di anticipo.
          </p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4B5563;">
            Nel tuo spazio trovi i giorni in cui siamo liberi: scegli quello che ti va meglio
            e ti confermiamo noi.
          </p>
        </td></tr>

        <tr><td style="padding:0 40px 32px;" align="center">
          <a href="${portalLink}"
             style="display:inline-block;background-color:#0A263A;color:#ffffff;text-decoration:none;
                    padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">
            Scegli il giorno
          </a>
        </td></tr>

        <tr><td style="padding:20px 40px;background-color:#FAFAF9;border-top:1px solid #E5E7EB;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#9CA3AF;">
            Preferisci sentirci a voce? Rispondi pure a questa email.
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
    subject: `Fissiamo il prossimo shooting — ${clientName}`,
    html,
  });
}

interface MessaggioClienteParams {
  to: string[];
  clientName: string;
  chi: string;
  estratto: string;
  quantiAllegati: number;
  link: string;
}

/**
 * Avvisa il team che un cliente ha scritto dal portale.
 *
 * A differenza delle altre di questo file, parla verso l'interno: il tono è
 * quello di una segnalazione di lavoro, non di una comunicazione al cliente.
 * Esiste perché il gestionale non ha notifiche push: senza questa email un
 * messaggio resterebbe fermo finché qualcuno non apre per caso la scheda —
 * e un canale a cui non si risponde è peggio di un canale che non c'è.
 */
export async function sendMessaggioClienteEmail({
  to, clientName, chi, estratto, quantiAllegati, link,
}: MessaggioClienteParams) {
  if (to.length === 0) return;

  const allegati = quantiAllegati === 0
    ? ''
    : `<p style="margin:12px 0 0;font-size:13px;color:#6B7280;">
         Con ${quantiAllegati === 1 ? 'un allegato' : `${quantiAllegati} allegati`}.
       </p>`;

  const html = `<!DOCTYPE html>
<html lang="it">
<body style="margin:0;padding:24px;background-color:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:28px 32px 8px;">
      <p style="margin:0;font-size:13px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.5px;">
        Messaggio dal portale
      </p>
      <h1 style="margin:6px 0 0;font-size:19px;color:#111827;">
        ${escapeHtml(clientName)}
      </h1>
      <p style="margin:2px 0 0;font-size:14px;color:#6B7280;">${escapeHtml(chi)}</p>
    </td></tr>

    <tr><td style="padding:16px 32px;">
      <div style="border-left:3px solid #E5E7EB;padding-left:14px;">
        <p style="margin:0;font-size:15px;line-height:1.55;color:#374151;white-space:pre-wrap;">${escapeHtml(estratto)}</p>
      </div>
      ${allegati}
    </td></tr>

    <tr><td style="padding:8px 32px 32px;">
      <a href="${link}"
         style="display:inline-block;background-color:#0A263A;color:#ffffff;text-decoration:none;
                padding:12px 26px;border-radius:10px;font-size:14px;font-weight:600;">
        Rispondi
      </a>
    </td></tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: to.join(', '),
    subject: `${clientName} ha scritto dal portale`,
    html,
  });
}
