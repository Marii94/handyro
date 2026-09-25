// services/stripe.js
// Funcții de bază pentru plăți cu autorizare/capturare manuală (escrow-style):
// 1. createHold  — blochează banii pe card (autorizare), fără să-i retragă încă
// 2. captureHold — retrage efectiv banii deja blocați (când jobul e finalizat)
// 3. cancelHold  — eliberează banii blocați înapoi către client (fără să fi fost retrași)
//
// Variabilă de mediu necesară: STRIPE_SECRET_KEY (sk_test_... sau sk_live_...)

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_SECRET_KEY ? require('stripe')(STRIPE_SECRET_KEY) : null;

function ensureConfigured() {
  if (!stripe) throw new Error('STRIPE_SECRET_KEY nu este setat pe server.');
}

// Creează o autorizare (hold) pe card pentru suma dată, în lei.
// capture_method: 'manual' = banii sunt doar rezervați, nu retrași încă.
async function createHold(amountLei, metadata) {
  ensureConfigured();
  const amountBani = Math.round(Number(amountLei) * 100);
  if (!amountBani || amountBani < 100) throw new Error('Sumă invalidă pentru plată.');
  const intent = await stripe.paymentIntents.create({
    amount: amountBani,
    currency: 'ron',
    capture_method: 'manual',
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    metadata: metadata || {},
  });
  return intent; // conține client_secret, folosit de frontend pentru a confirma cardul
}

// Retrage efectiv banii deja autorizați (job finalizat cu succes).
async function captureHold(paymentIntentId) {
  ensureConfigured();
  return stripe.paymentIntents.capture(paymentIntentId);
}

// Anulează autorizarea — banii nu au fost niciodată retrași, doar se eliberează rezervarea.
async function cancelHold(paymentIntentId) {
  ensureConfigured();
  return stripe.paymentIntents.cancel(paymentIntentId);
}

// Verifică starea curentă a unei autorizări (util înainte de a crea jobul).
async function retrieveIntent(paymentIntentId) {
  ensureConfigured();
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

module.exports = { createHold, captureHold, cancelHold, retrieveIntent };
