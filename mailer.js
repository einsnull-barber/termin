require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const SHOP = {
  name: process.env.SHOP_NAME || 'Eins Null Barber',
  notifyTo: process.env.SHOP_COPY_TO, // an diese Adresse gehen ALLE Buchungen
  logoUrl: process.env.LOGO_URL || '',
  colors: { bg: '#f4f1ec', card: '#ffffff', dark: '#111111', accent: '#c9a45c', text: '#333333', muted: '#888888' },
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function formatDate(iso) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('de-DE', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

function buildHtml(b) {
  const c = SHOP.colors;
  const row = (label, value, html) =>
    value
      ? `<tr>
          <td style="padding:12px 0;border-bottom:1px solid #eee;color:${c.muted};font-size:13px;text-transform:uppercase;letter-spacing:1px;width:38%;">${label}</td>
          <td style="padding:12px 0;border-bottom:1px solid #eee;color:${c.dark};font-size:16px;font-weight:600;">${html || esc(value)}</td>
        </tr>`
      : '';

  const logo = SHOP.logoUrl
    ? `<img src="${esc(SHOP.logoUrl)}" alt="${esc(SHOP.name)}" width="120" style="display:block;max-width:120px;height:auto;border:0;">`
    : `<span style="color:${c.accent};font-size:24px;font-weight:700;letter-spacing:2px;">${esc(SHOP.name)}</span>`;

  const tel = b.phone ? `<a href="tel:${esc(b.phone.replace(/[^\d+]/g, ''))}" style="color:${c.dark};text-decoration:underline;">${esc(b.phone)}</a>` : '';

  return `<!DOCTYPE html>
<html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Neue Terminbuchung</title></head>
<body style="margin:0;padding:0;background:${c.bg};font-family:Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.bg};padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${c.card};border-radius:14px;overflow:hidden;">
    <tr><td align="center" style="background:${c.dark};padding:32px 20px;">${logo}</td></tr>
    <tr><td style="height:4px;background:${c.accent};line-height:4px;font-size:0;">&nbsp;</td></tr>
    <tr><td style="padding:36px 28px 8px;">
      <h1 style="margin:0 0 10px;font-size:26px;color:${c.dark};">Neue Terminbuchung ✂️</h1>
      <p style="margin:0;font-size:16px;line-height:1.6;color:${c.text};">
        Über die Webseite wurde ein neuer Termin gebucht.
      </p>
    </td></tr>
    <tr><td style="padding:8px 28px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${row('Kunde', b.name)}
        ${row('Telefon', b.phone, tel)}
        ${row('Datum', formatDate(b.date))}
        ${row('Uhrzeit', b.time + ' Uhr')}
        ${row('Barber', b.barber)}
        ${row('Leistung', b.service)}
        ${row('Preis', b.price)}
      </table>
    </td></tr>
    <tr><td style="padding:24px 28px 32px;text-align:center;font-size:13px;line-height:1.6;color:${c.muted};">
      Der Termin ist als Kalender-Datei (.ics) angehängt.
    </td></tr>
  </table>
  <p style="font-size:12px;color:${c.muted};margin:16px 0 0;">© ${new Date().getFullYear()} ${esc(SHOP.name)}</p>
</td></tr></table>
</body></html>`;
}

function buildText(b) {
  return `Neue Terminbuchung\n\nKunde: ${b.name}\nTelefon: ${b.phone}\nDatum: ${formatDate(b.date)}\nUhrzeit: ${b.time} Uhr\nBarber: ${b.barber}\nLeistung: ${b.service}\nPreis: ${b.price}`;
}

function buildIcs(b) {
  const start = b.date.replace(/-/g, '') + 'T' + b.time.replace(':', '') + '00';
  const [h, m] = b.time.split(':').map(Number);
  const dur = Number(b.durationMin) || 30;
  const endMin = h * 60 + m + dur;
  const end = b.date.replace(/-/g, '') + 'T' + String(Math.floor(endMin / 60) % 24).padStart(2, '0') + String(endMin % 60).padStart(2, '0') + '00';
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Barbershop//DE', 'BEGIN:VEVENT',
    `UID:${Date.now()}@barbershop`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART;TZID=Europe/Berlin:${start}`, `DTEND;TZID=Europe/Berlin:${end}`,
    `SUMMARY:${b.name} – ${b.service} (${b.barber})`,
    `DESCRIPTION:Tel: ${b.phone}`, 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

async function sendBookingEmail(booking) {
  if (!SHOP.notifyTo) throw new Error('SHOP_COPY_TO ist nicht gesetzt');
  const { data, error } = await resend.emails.send({
    from: process.env.MAIL_FROM,
    to: [SHOP.notifyTo], // nur an dich – der Kunde bekommt keine Mail
    subject: `Neue Buchung: ${booking.name} – ${formatDate(booking.date)}, ${booking.time} Uhr`,
    html: buildHtml(booking),
    text: buildText(booking),
    attachments: [{ filename: 'termin.ics', content: Buffer.from(buildIcs(booking), 'utf-8') }],
  });
  if (error) throw new Error(error.message || 'Resend-Fehler');
  return data;
}

module.exports = { sendBookingEmail };
