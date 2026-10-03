const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const { createHold } = require('../services/stripe');
const { Worker } = require('../db');

// Clientul apasă "Trimite cererea" -> se creează o autorizare de card
// (banii sunt blocați, nu retrași) -> frontend-ul confirmă cardul cu Stripe.js
// folosind client_secret-ul primit aici -> abia apoi se creează jobul.
//
// Dacă meșterul ales are contul Stripe Connect activ, plata se face direct
// către el (destination charge) — platforma reține doar comisionul
// (application_fee_amount), restul nu tranzitează niciodată ca venit propriu.
// Dacă meșterul nu e încă onboardat la Stripe, se cade pe fluxul vechi (toată
// suma intră în contul platformei, comisionul se calculează și se plătește manual).
router.post('/create-intent', auth, requireRole('client', 'horeca'), async (req, res) => {
  try {
    const { amount, worker_id } = req.body;
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Sumă invalidă' });

    const metadata = { client_id: req.user.id, client_email: req.user.email };
    let connectOpts = null;

    if (worker_id) {
      const worker = await Worker.findById(worker_id);
      if (worker && worker.stripe_account_id && worker.stripe_payouts_enabled) {
        const hasAgency = !!worker.referral_source;
        const platformSharePct = hasAgency ? 0.30 : 0.20; // restul (70% sau 80%) merge direct la meșter
        const applicationFeeLei = Math.round(Number(amount) * platformSharePct * 100) / 100;
        connectOpts = { destinationAccountId: worker.stripe_account_id, applicationFeeLei };
        metadata.worker_id = String(worker._id);
        metadata.split = 'connect';
      }
    }

    const intent = await createHold(amount, metadata, connectOpts);
    res.json({ client_secret: intent.client_secret, payment_intent_id: intent.id, split_via_connect: !!connectOpts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
