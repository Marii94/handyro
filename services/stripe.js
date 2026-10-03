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
//
// connectOpts (opțional) — pentru plată tip "destination charge", banii merg
// direct către contul Stripe Connect al meșterului la capturare, iar platforma
// reține doar "application_fee_amount" (comisionul). Astfel, suma integrală nu
// tranzitează niciodată ca venit propriu al platformei — doar comisionul.
//   { destinationAccountId: 'acct_...', applicationFeeLei: number }
async function createHold(amountLei, metadata, connectOpts) {
  ensureConfigured();
  const amountBani = Math.round(Number(amountLei) * 100);
  if (!amountBani || amountBani < 100) throw new Error('Sumă invalidă pentru plată.');
  const params = {
    amount: amountBani,
    currency: 'ron',
    capture_method: 'manual',
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    metadata: metadata || {},
  };
  if (connectOpts && connectOpts.destinationAccountId) {
    const feeBani = Math.round(Number(connectOpts.applicationFeeLei || 0) * 100);
    params.on_behalf_of = connectOpts.destinationAccountId;
    params.transfer_data = { destination: connectOpts.destinationAccountId };
    params.application_fee_amount = feeBani;
  }
  const intent = await stripe.paymentIntents.create(params);
  return intent; // conține client_secret, folosit de frontend pentru a confirma cardul
}

// ── Stripe Connect — cont pentru meșter ───────────────────────────────────────
// Creează un cont Connect de tip "Express" pentru un meșter (dacă nu are deja unul).
async function createConnectedAccount(email, metadata) {
  ensureConfigured();
  return stripe.accounts.create({
    type: 'express',
    country: 'RO',
    email,
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    business_type: 'individual',
    metadata: metadata || {},
  });
}

// Generează linkul de onboarding (verificare identitate + cont bancar) — meșterul
// e redirecționat acolo ca să-și completeze datele direct la Stripe, în siguranță.
async function createAccountLink(accountId, refreshUrl, returnUrl) {
  ensureConfigured();
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });
}

// Verifică dacă meșterul a terminat onboarding-ul și poate primi plăți.
async function getAccountStatus(accountId) {
  ensureConfigured();
  const acct = await stripe.accounts.retrieve(accountId);
  return {
    details_submitted: !!acct.details_submitted,
    charges_enabled: !!acct.charges_enabled,
    payouts_enabled: !!acct.payouts_enabled,
  };
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

module.exports = { createHold, captureHold, cancelHold, retrieveIntent, createConnectedAccount, createAccountLink, getAccountStatus };
