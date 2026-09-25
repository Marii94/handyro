const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const { createHold } = require('../services/stripe');

// Clientul apasă "Trimite cererea" -> se creează o autorizare de card
// (banii sunt blocați, nu retrași) -> frontend-ul confirmă cardul cu Stripe.js
// folosind client_secret-ul primit aici -> abia apoi se creează jobul.
router.post('/create-intent', auth, requireRole('client', 'horeca'), async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Sumă invalidă' });
    const intent = await createHold(amount, { client_id: req.user.id, client_email: req.user.email });
    res.json({ client_secret: intent.client_secret, payment_intent_id: intent.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
