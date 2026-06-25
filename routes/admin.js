const express = require('express');
const router = express.Router();
const { User, Worker, Price, Job, Message, Conversation } = require('../db');
const { auth, requireRole } = require('../middleware/auth');

router.use(auth, requireRole('admin'));

router.get('/stats', async (req, res) => {
  try {
    res.json({
      total_users: await User.countDocuments({ role: { $ne: 'admin' } }),
      active_workers: await User.countDocuments({ role: 'meserias', status: 'active' }),
      pending_workers: await User.countDocuments({ role: 'meserias', status: 'pending' }),
      total_clients: await User.countDocuments({ role: 'client' }),
      total_jobs: await Job.countDocuments(),
      total_messages: await Message.countDocuments(),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/users', async (req, res) => {
  try {
    const users = await User.find({});
    const result = await Promise.all(users.map(async u => {
      const w = await Worker.findOne({ user_id: u._id });
      const prices = w ? await Price.find({ worker_id: w._id }) : [];
      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        phone: u.phone || '',
        rating: w?.rating,
        reviews_count: w?.reviews_count,
        worker_id: w?._id,
        specialization: w?.specialization,
        categories: w?.categories || [],
        prices,
      };
    }));
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/users/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active','blocked','pending'].includes(status)) return res.status(400).json({ error: 'Status invalid' });
    await User.findByIdAndUpdate(req.params.id, { status });
    res.json({ message: 'Status actualizat', status });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/workers/:workerId/price', async (req, res) => {
  try {
    const { category, price } = req.body;
    const p = Number(price);
    if (!p || p < 1) return res.status(400).json({ error: 'Preț invalid' });
    const cat = category || 'Toate categoriile';
    await Price.findOneAndUpdate({ worker_id: req.params.workerId, category: cat }, { price: p }, { upsert: true });
    res.json({ message: 'Preț actualizat: ' + p + ' lei', price: p });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role === 'admin') return res.status(403).json({ error: 'Nu poți șterge acest cont' });
    const w = await Worker.findOne({ user_id: req.params.id });
    if (w) { await Price.deleteMany({ worker_id: w._id }); await Worker.findByIdAndDelete(w._id); }
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'Utilizator șters' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.patch('/users/:id/assign-worker', async (req, res) => {
  try {
    const { worker_id } = req.body;
    if (!worker_id) return res.status(400).json({ error: 'Worker ID lipsă' });
    await User.findByIdAndUpdate(req.params.id, { assigned_worker: worker_id });
    res.json({ message: 'Meșter atribuit cu succes!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
