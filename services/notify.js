// services/notify.js
// Trimite notificări către admin pe email (Resend) atunci când apare
// un job nou sau un mesaj nou de chat.
//
// Variabile de mediu necesare (setează-le pe server, NU în cod):
//   RESEND_API_KEY — cheia API de la resend.com
//   EMAIL_FROM     — ex: 'HandyRO <onboarding@resend.dev>' (folosește domeniul lor de test
//                     până îți verifici propriul domeniu în Resend)
//   ADMIN_EMAIL    — admin@handyro.ro, sau orice adresă unde vrei să primești notificările
//
// Dacă lipsesc variabilele, notificările sunt pur și simplu dezactivate
// (se scrie un mesaj în consolă), nu se aruncă nicio eroare care ar putea bloca
// crearea jobului/mesajului.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'HandyRO <onboarding@resend.dev>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

async function sendAdminEmail(subject, text) {
  if (!RESEND_API_KEY || !ADMIN_EMAIL) {
    console.log('[notify] Email dezactivat — lipsesc RESEND_API_KEY sau ADMIN_EMAIL din variabilele de mediu.');
    return;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: ADMIN_EMAIL,
        subject,
        text,
      }),
    });
    if (!r.ok) {
      const errBody = await r.text();
      console.error('[notify] Resend a răspuns cu eroare:', r.status, errBody);
    }
  } catch (e) {
    console.error('[notify] Eroare la trimiterea email-ului:', e.message);
  }
}

// Nu aruncă erori mai departe — o notificare picată nu trebuie niciodată
// să blocheze crearea unui job/mesaj.
async function notifyAdmin(subject, text) {
  await sendAdminEmail(subject, text);
}

module.exports = { notifyAdmin };
