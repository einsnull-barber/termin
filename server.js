require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { sendBookingEmail } = require('./mailer');

const app = express();
app.use(express.json());
app.use(express.static(require('path').join(__dirname, 'public'))); // liefert public/index.html aus
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' })); // später auf deine Domain beschränken

// Einfaches Rate-Limit: max. 5 Buchungen pro IP und 10 Minuten
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const list = (hits.get(req.ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (list.length >= 5) return res.status(429).json({ ok: false, error: 'Zu viele Anfragen. Bitte später erneut versuchen.' });
  list.push(now);
  hits.set(req.ip, list);
  next();
}

app.post('/api/book', rateLimit, async (req, res) => {
  const { name, phone, date, time, service, barber, price, durationMin } = req.body || {};

  if (!name || !phone || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '') || !service) {
    return res.status(400).json({ ok: false, error: 'Bitte alle Pflichtfelder korrekt ausfüllen.' });
  }

  try {
    // TODO: Hier ggf. den Termin in deiner Datenbank speichern
    await sendBookingEmail({ name, phone, date, time, service, barber, price, durationMin });
    res.json({ ok: true });
  } catch (err) {
    console.error('Mail-Fehler:', err);
    res.status(500).json({ ok: false, error: 'E-Mail konnte nicht gesendet werden.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
