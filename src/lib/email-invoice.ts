import nodemailer from 'nodemailer';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

interface InvoiceReminderParams {
  to: string;
  clientName: string;
  invoiceNumber: string;
  total: number;
  dueDate: string;
  daysOverdue: number;
}

export async function sendInvoiceReminder({
  to, clientName, invoiceNumber, total, dueDate, daysOverdue,
}: InvoiceReminderParams) {
  const safeClientName = escapeHtml(clientName);
  const safeInvoiceNumber = escapeHtml(invoiceNumber);
  const formattedTotal = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(total);
  const formattedDueDate = new Date(dueDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:30px 20px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border:1px solid #E5E5E5;">
  <tr><td style="padding:24px 32px;border-bottom:1px solid #EEE;">
    <img src="https://gestionale.piraweb.it/logo-email.png" alt="PiraWeb" width="120" style="display:block;" />
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <h2 style="margin:0 0 16px;color:#333;font-size:20px;">Sollecito di pagamento</h2>
    <p style="margin:0 0 16px;color:#555;font-size:14px;line-height:1.6;">
      Spett.le ${safeClientName},<br><br>
      con la presente ci permettiamo di segnalarLe che, da un controllo della nostra contabilit&agrave;, la fattura n. <strong>${safeInvoiceNumber}</strong> sotto indicata risulta ad oggi ancora insoluta.
    </p>
    <p style="margin:0 0 16px;color:#555;font-size:14px;line-height:1.6;">
      Siamo certi che si tratti di una semplice dimenticanza e confidiamo in un Suo cortese riscontro.
    </p>

    <table width="100%" style="background:#FFF8F0;border:1px solid #FFE0B2;border-radius:6px;margin:16px 0;">
      <tr><td style="padding:16px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="color:#888;font-size:12px;padding-bottom:8px;">Fattura n.</td>
            <td style="color:#333;font-size:14px;font-weight:600;text-align:right;padding-bottom:8px;">${safeInvoiceNumber}</td>
          </tr>
          <tr>
            <td style="color:#888;font-size:12px;padding-bottom:8px;">Importo totale</td>
            <td style="color:#E65100;font-size:16px;font-weight:700;text-align:right;padding-bottom:8px;">${formattedTotal}</td>
          </tr>
          <tr>
            <td style="color:#888;font-size:12px;padding-bottom:8px;">Scadenza</td>
            <td style="color:#333;font-size:14px;text-align:right;padding-bottom:8px;">${formattedDueDate}</td>
          </tr>
          <tr>
            <td style="color:#888;font-size:12px;">Giorni di ritardo</td>
            <td style="color:#D32F2F;font-size:14px;font-weight:600;text-align:right;">${daysOverdue} giorni</td>
          </tr>
        </table>
      </td></tr>
    </table>

    <table width="100%" style="background:#F0F7FF;border:1px solid #BBDEFB;border-radius:6px;margin:16px 0;">
      <tr><td style="padding:14px 20px;">
        <p style="margin:0 0 4px;color:#1565C0;font-size:12px;font-weight:600;">Coordinate bancarie per il pagamento</p>
        <p style="margin:0;color:#333;font-size:14px;font-family:monospace;">IBAN: IT49K0200874791000107356887</p>
        <p style="margin:4px 0 0;color:#888;font-size:12px;">Intestato a: PIRA WEB S.R.L.</p>
      </td></tr>
    </table>

    <p style="margin:16px 0 0;color:#555;font-size:14px;line-height:1.6;">
      La invitiamo cortesemente a provvedere al saldo dell&rsquo;importo dovuto entro e non oltre i prossimi 5 giorni lavorativi, tramite bonifico bancario alle coordinate sopra indicate.
    </p>
    <p style="margin:12px 0 0;color:#555;font-size:14px;line-height:1.6;">
      Qualora il pagamento fosse gi&agrave; stato effettuato, La preghiamo di considerare la presente come non ricevuta e di inviarci cortesemente copia della contabile.
    </p>
    <p style="margin:12px 0 0;color:#555;font-size:14px;line-height:1.6;">
      Restiamo a disposizione per qualsiasi chiarimento.
    </p>

    <p style="margin:20px 0 0;color:#333;font-size:13px;">
      Cordiali saluti,<br>
      <strong>Ing. Raffaele Antonio Piccolo</strong><br>
      <span style="color:#888;">CEO &amp; Project Manager &mdash; PiraWeb</span><br>
      <span style="color:#888;">amministrazione@piraweb.it &bull; +39 331 853 5698</span>
    </p>
  </td></tr>
  <tr><td style="padding:12px 32px;background:#FAFAFA;border-top:1px solid #EEE;">
    <p style="margin:0;color:#999;font-size:10px;text-align:center;"><strong>Pira Web S.R.L.</strong> &mdash; P.IVA 04891370613 &mdash; Via Raffaello 2, 81030 Casapesenna (CE)</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = `Sollecito di pagamento

Spett.le ${clientName},

con la presente ci permettiamo di segnalarLe che, da un controllo della nostra contabilita', la fattura n. ${invoiceNumber} sotto indicata risulta ad oggi ancora insoluta.

Siamo certi che si tratti di una semplice dimenticanza e confidiamo in un Suo cortese riscontro.

Fattura: ${invoiceNumber}
Importo: ${formattedTotal}
Scadenza: ${formattedDueDate}
Giorni di ritardo: ${daysOverdue}

Coordinate bancarie per il pagamento:
IBAN: IT49K0200874791000107356887
Intestato a: PIRA WEB S.R.L.

La invitiamo cortesemente a provvedere al saldo dell'importo dovuto entro e non oltre i prossimi 5 giorni lavorativi, tramite bonifico bancario alle coordinate sopra indicate.

Qualora il pagamento fosse gia' stato effettuato, La preghiamo di considerare la presente come non ricevuta e di inviarci cortesemente copia della contabile.

Restiamo a disposizione per qualsiasi chiarimento.

Cordiali saluti,
Ing. Raffaele Antonio Piccolo
PiraWeb - amministrazione@piraweb.it - +39 331 853 5698`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'PiraWeb <amministrazione@piraweb.it>',
    to,
    replyTo: 'amministrazione@piraweb.it',
    subject: `Sollecito di pagamento - Fattura ${invoiceNumber} - PiraWeb`,
    html,
    text,
  });
}

/**
 * Generate a WhatsApp link with a pre-filled reminder message.
 */
export function generateWhatsAppReminderLink(
  phone: string,
  clientName: string,
  invoiceNumber: string,
  total: number,
  daysOverdue: number,
): string {
  const formattedTotal = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(total);

  // Clean phone number
  let cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');
  if (cleanPhone.startsWith('+')) cleanPhone = cleanPhone.slice(1);
  if (cleanPhone.startsWith('0')) cleanPhone = '39' + cleanPhone.slice(1);
  if (!cleanPhone.startsWith('39')) cleanPhone = '39' + cleanPhone;

  const message = `Buongiorno ${clientName},

le scrivo per ricordarle che la fattura n. ${invoiceNumber} di ${formattedTotal} risulta scaduta da ${daysOverdue} giorni.

La preghiamo di procedere al pagamento o di confermarci l'avvenuto bonifico.

Per qualsiasi chiarimento siamo a disposizione.

Cordiali saluti,
Raffaele Piccolo - PiraWeb`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
