const express = require('express');
const router = express.Router();
const { User, Worker, Price } = require('../db');
const { auth, requireRole } = require('../middleware/auth');

router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const workers = await Worker.find({});
    let result = await Promise.all(workers.map(async w => {
      const u = await User.findById(w.user_id);
      if (!u || u.status !== 'active') return null;
      let price = null;
      if (category) {
        const priceDoc = await Price.findOne({ worker_id: w._id, category });
        if (!priceDoc) return null;
        price = priceDoc.price;
      }
      const { Job } = require('../db');
const { time_slot } = req.query;
let available = true;
if(time_slot && time_slot !== '18:00–20:00 — tarif urgență'){
  const busyJob = await Job.findOne({
    worker_id: w._id,
    time_slot: time_slot,
    status: { $in: ['pending','accepted'] }
  });
  if(busyJob) available = false;
}
return { _id: w._id, name: u.name, specialization: w.specialization, rating: w.rating, reviews_count: w.reviews_count, city: w.city, price_for_category: price, available };
    }));
    res.json(result.filter(Boolean));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/me/dashboard', auth, requireRole('meserias'), async (req, res) => {
  try {
    const worker = await Worker.findOne({ user_id: req.user.id });
    if (!worker) return res.status(404).json({ error: 'Profil negăsit' });
    const { Job, Conversation, Message } = require('../db');
    const allJobs = await Job.find({ worker_id: worker._id });
    const jobs = await Promise.all(allJobs.map(async j => {
      const client = await User.findById(j.client_id);
      const jobj2 = j.toObject(); return { ...jobj2, id: String(jobj2._id), client_name: client?.name };
    }));
    const convs = await Conversation.find({ worker_id: req.user.id });
    let unread = 0;
    for (const c of convs) {
      unread += await Message.countDocuments({ conversation_id: c._id, sender_id: { $ne: req.user.id }, is_read: false });
    }
    const prices = await Price.find({ worker_id: worker._id });
    res.json({ worker, jobs, prices, unread_messages: unread });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.get('/availability', async (req, res) => {
  try {
    const { worker_id, date } = req.query;
    if (!worker_id || !date) return res.status(400).json({ error: 'Parametri lipsă' });
    const { Job } = require('../db');
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const jobs = await Job.find({
      worker_id: worker_id,
      status: { $in: ['pending', 'accepted'] },
      job_date: { $gte: startOfDay, $lte: endOfDay }
    });
    res.json(jobs.map(j => ({ time_slot: j.time_slot })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
