const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { auth, requireRole } = require('../middleware/auth');

// GET /api/workers?category=X — meseriasi cu pretul lor per categorie
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const workers = await db.workers.find({});

    let result = await Promise.all(workers.map(async w => {
      const u = await db.users.findOne({ _id: w.user_id });
      if (!u || u.status !== 'active') return null;

      // Gaseste pretul acestui meserias pentru categoria ceruta
      let price = null;
      if (category) {
        const priceDoc = await db.prices.findOne({ worker_id: w._id, category });
        if (!priceDoc) return null; // nu acopera categoria asta
        price = priceDoc.price;
      }

      return { ...w, name: u.name, email: u.email, status: u.status, price_for_category: price };
    }));

    result = result.filter(Boolean);
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/workers/me/dashboard
router.get('/me/dashboard', auth, requireRole('meserias'), async (req, res) => {
  try {
    const worker = await db.workers.findOne({ user_id: req.user.id });
    if (!worker) return res.status(404).json({ error: 'Profil meșter negăsit' });
    const allJobs = await db.jobs.find({ worker_id: worker._id });
    const jobs = await Promise.all(allJobs.map(async j => {
      const client = await db.users.findOne({ _id: j.client_id });
      return { ...j, client_name: client?.name };
    }));
    // Preturi per categorie ale acestui meserias
    const prices = await db.prices.find({ worker_id: worker._id });
    const allConvs = await db.conversations.find({ worker_id: req.user.id });
    let unread = 0;
    for (const c of allConvs) {
      const cnt = await db.messages.count({ conversation_id: c._id, sender_id: { $ne: req.user.id }, is_read: false });
      unread += cnt;
    }
    res.json({ worker, jobs, prices, unread_messages: unread });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/workers/prices/:workerId/:category — admin seteaza pretul
router.patch('/prices/:workerId', auth, requireRole('admin'), async (req, res) => {
  try {
    const { category, price } = req.body;
    const p = Number(price);
    if (!category || !p || p < 1) return res.status(400).json({ error: 'Date invalide' });
    const existing = await db.prices.findOne({ worker_id: req.params.workerId, category });
    if (existing) {
      await db.prices.update({ _id: existing._id }, { $set: { price: p } });
    } else {
      await db.prices.insert({ worker_id: req.params.workerId, category, price: p });
    }
    res.json({ message: 'Preț actualizat', price: p });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
