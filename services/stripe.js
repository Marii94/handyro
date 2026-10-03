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

// ── Stripe Connect — cont pentru meșter (API v2, prin rawRequest) ────────────
// Stripe nu mai acceptă API-ul vechi (v1, stripe.accounts.create) pentru conturi
// Connect noi — necesită API-ul curent, v2. În loc să depindem de un pachet npm
// "preview" instabil (care a picat deploy-ul), folosim rawRequest — disponibil
// direct în pachetul stripe normal/stabil din v17 încoace — ca să apelăm
// endpoint-urile v2 fără nicio schimbare de dependință.
const V2_API_VERSION = '2026-09-30.preview';

// Configurația "recipient" cu capacitatea "stripe_balance.stripe_transfers" e
// cea care permite contului să primească transferuri de la platformă (necesară
// pentru destination charges — exact fluxul nostru).
async function createConnectedAccount(email, metadata) {
  ensureConfigured();
  return stripe.rawRequest('POST', '/v2/core/accounts', {
    contact_email: email,
    display_name: email,
    defaults: {
      responsibilities: {
        fees_collector: 'application',
        losses_collector: 'application',
      },
    },
    dashboard: 'express',
    identity: { country: 'ro' },
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: { stripe_transfers: { requested: true } },
        },
      },
    },
    metadata: metadata || {},
    include: ['configuration.recipient', 'identity', 'requirements'],
  }, { apiVersion: V2_API_VERSION });
}

// Generează linkul de onboarding (verificare identitate + cont bancar) — meșterul
// e redirecționat acolo ca să-și completeze datele direct la Stripe, în siguranță.
async function createAccountLink(accountId, refreshUrl, returnUrl) {
  ensureConfigured();
  return stripe.rawRequest('POST', '/v2/core/account_links', {
    account: accountId,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        return_url: returnUrl,
        refresh_url: refreshUrl,
      },
    },
  }, { apiVersion: V2_API_VERSION });
}

// Verifică dacă meșterul a terminat onboarding-ul și poate primi plăți —
// capacitatea "stripe_transfers" trebuie să fie "active".
async function getAccountStatus(accountId) {
  ensureConfigured();
  const acct = await stripe.rawRequest(
    'GET',
    `/v2/core/accounts/${accountId}?include[0]=configuration.recipient&include[1]=requirements`,
    null,
    { apiVersion: V2_API_VERSION }
  );
  const capStatus = acct.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  const hasOutstandingRequirements = !!(acct.requirements?.entries && acct.requirements.entries.length > 0);
  return {
    details_submitted: !hasOutstandingRequirements,
    charges_enabled: capStatus === 'active',
    payouts_enabled: capStatus === 'active',
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
