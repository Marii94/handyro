const express = require('express');
const router = express.Router();
const { db, CATEGORIES } = require('../db');
const { auth, requireRole } = require('../middleware/auth');

router.use(auth, requireRole('admin'));

router.get('/stats', async (req, res) => {
  try {
    res.json({
      total_users: await db.users.count({ role: { $ne: 'admin' } }),
      active_workers: await db.users.count({ role: 'meserias', status: 'active' }),
      pending_workers: await db.users.count({ role: 'meserias', status: 'pending' }),
      total_clients: await db.users.count({ role: 'client' }),
      total_jobs: await db.jobs.count({}),
      total_messages: await db.messages.count({}),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/users', async (req, res) => {
  try {
    const users = await db.users.find({});
    const result = await Promise.all(users.map(async u => {
      const w = await db.workers.findOne({ user_id: u._id });
      const prices = w ? await db.prices.find({ worker_id: w._id }) : [];
      return { ...u, password: undefined, rating: w?.rating, reviews_count: w?.reviews_count, worker_id: w?._id, specialization: w?.specialization, prices };
    }));
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/users/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active','blocked','pending'].includes(status)) return res.status(400).json({ error: 'Status invalid' });
    await db.users.update({ _id: req.params.id }, { $set: { status } });
    res.json({ message: 'Status actualizat', status });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin seteaza pretul unui meserias per categorie
router.patch('/workers/:workerId/price', async (req, res) => {
  try {
    const { category, price } = req.body;
    const p = Number(price);
    if (!p || p < 1) return res.status(400).json({ error: 'Preț invalid' });
    const cat = category || 'Toate categoriile';
    const existing = await db.prices.findOne({ worker_id: req.params.workerId, category: cat });
    if (existing) {
      await db.prices.update({ _id: existing._id }, { $set: { price: p } });
    } else {
      await db.prices.insert({ worker_id: req.params.workerId, category: cat, price: p });
    }
    res.json({ message: 'Preț actualizat: ' + p + ' lei', price: p });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const user = await db.users.findOne({ _id: req.params.id });
    if (!user || user.role === 'admin') return res.status(403).json({ error: 'Nu poți șterge acest cont' });
    const w = await db.workers.findOne({ user_id: req.params.id });
    if (w) { await db.prices.remove({ worker_id: w._id }, { multi: true }); await db.workers.remove({ _id: w._id }, {}); }
    await db.users.remove({ _id: req.params.id }, {});
    res.json({ message: 'Utilizator șters' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
