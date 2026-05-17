const express = require('express');
const router = express.Router();
const db = require('../db');
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
      return { ...u, password: undefined, price_per_job: w?.price_per_job, rating: w?.rating, reviews_count: w?.reviews_count, worker_id: w?._id, specialization: w?.specialization };
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

// FIX: editare pret meserias
router.patch('/workers/:workerId/price', async (req, res) => {
  try {
    const price = Number(req.body.price_per_job || req.body.price_per_hour);
    if (!price || price < 1) return res.status(400).json({ error: 'Pret invalid' });
    const numUpdated = await db.workers.update({ _id: req.params.workerId }, { $set: { price_per_job: price } });
    if (numUpdated === 0) return res.status(404).json({ error: 'Mesterul nu exista' });
    res.json({ message: 'Pret actualizat', price_per_job: price });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// FIX: stergere user
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await db.users.findOne({ _id: req.params.id });
    if (!user || user.role === 'admin') return res.status(403).json({ error: 'Nu poți șterge acest cont' });
    // Sterge si worker-ul asociat
    await db.workers.remove({ user_id: req.params.id }, {});
    await db.users.remove({ _id: req.params.id }, {});
    res.json({ message: 'Utilizator șters' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
