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
      return { ...u, password: undefined, price_per_hour: w?.price_per_hour, rating: w?.rating, reviews_count: w?.reviews_count, worker_id: w?._id };
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

router.patch('/workers/:workerId/price', async (req, res) => {
  try {
    const price = Number(req.body.price_per_hour);
    if (!price || price < 0) return res.status(400).json({ error: 'Preț invalid' });
    await db.workers.update({ _id: req.params.workerId }, { $set: { price_per_hour: price } });
    res.json({ message: 'Preț actualizat', price_per_hour: price });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    await db.users.remove({ _id: req.params.id, role: { $ne: 'admin' } });
    res.json({ message: 'Utilizator șters' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
