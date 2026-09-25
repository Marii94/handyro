// services/notify.js
// Trimite emailuri prin Resend — atât notificări către admin, cât și emailuri
// directe către utilizatori (clienți/meșteri): confirmare de cont, răspunsuri de chat etc.
//
// Variabile de mediu necesare (setează-le pe server, NU în cod):
//   RESEND_API_KEY — cheia API de la resend.com
//   EMAIL_FROM     — ex: 'HandyRO <admin@handyro.ro>'
//   ADMIN_EMAIL    — adresa unde vrei să primești notificările de admin
//   APP_URL        — ex: 'https://handyro.ro' (folosit pentru linkul de verificare email)

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'HandyRO <onboarding@resend.dev>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

// Trimite un email către ORICE adresă — folosită atât pentru notificări admin,
// cât și pentru emailuri directe către clienți/meșteri.
async function sendEmail(to, subject, text) {
  if (!RESEND_API_KEY || !to) {
    console.log('[notify] Email dezactivat sau destinatar lipsă — lipsesc RESEND_API_KEY sau adresa destinatarului.');
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
        to,
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

// Trimite specific către adminul platformei. Nu aruncă erori mai departe —
// o notificare picată nu trebuie niciodată să blocheze crearea unui job/mesaj.
async function notifyAdmin(subject, text) {
  if (!ADMIN_EMAIL) {
    console.log('[notify] ADMIN_EMAIL nu e setat — notificare admin dezactivată.');
    return;
  }
  await sendEmail(ADMIN_EMAIL, subject, text);
}

module.exports = { notifyAdmin, sendEmail };
