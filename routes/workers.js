const express = require('express');
const router = express.Router();
const { User, Worker, Price } = require('../db');
const { auth, requireRole } = require('../middleware/auth');

router.get('/', async (req, res) => {
  try {
    const { category, city } = req.query;
    const workers = await Worker.find({});
    let result = await Promise.all(workers.map(async w => {
      const u = await User.findById(w.user_id);
      if (!u || u.status !== 'active') return null;

      // Dacă clientul a ales un sector/oraș, arătăm doar meșterii care au
      // bifat EXACT acea zonă la înregistrare (câmpul city e salvat ca
      // "Sector 1, Sector 3" — comparăm fiecare zonă individual).
      if (city) {
        const zones = (w.city || '').split(',').map(z => z.trim()).filter(Boolean);
        if (!zones.includes(city)) return null;
      }

      let price = null;
      if (category) {
  const priceDoc = await Price.findOne({ worker_id: w._id, category });
  price = priceDoc ? priceDoc.price : null;
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
return { _id: w._id, name: u.name, specialization: w.specialization, rating: w.rating, reviews_count: w.reviews_count, city: w.city, price_for_category: price, available, experience_years: w.experience_years, bio: w.bio, portfolio_photos: w.portfolio_photos || [] };
    }));
    res.json(result.filter(Boolean));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/me/profile', auth, requireRole('meserias'), async (req, res) => {
  try {
    const worker = await Worker.findOne({ user_id: req.user.id });
    if (!worker) return res.status(404).json({ error: 'Profil negăsit' });
    res.json({ experience_years: worker.experience_years, bio: worker.bio, portfolio_photos: worker.portfolio_photos || [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/me/profile', auth, requireRole('meserias'), async (req, res) => {
  try {
    const { experience_years, bio, portfolio_photos } = req.body;
    const update = {};
    if (experience_years !== undefined) {
      const n = Number(experience_years);
      if (experience_years !== null && (!Number.isFinite(n) || n < 0 || n > 60)) return res.status(400).json({ error: 'Ani de experiență invalizi.' });
      update.experience_years = experience_years === null || experience_years === '' ? null : n;
    }
    if (bio !== undefined) update.bio = String(bio).slice(0, 500);
    if (Array.isArray(portfolio_photos)) update.portfolio_photos = portfolio_photos.slice(0, 6);
    const worker = await Worker.findOneAndUpdate({ user_id: req.user.id }, update, { new: true });
    if (!worker) return res.status(404).json({ error: 'Profil negăsit' });
    res.json({ message: 'Profil actualizat ✓', experience_years: worker.experience_years, bio: worker.bio, portfolio_photos: worker.portfolio_photos });
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
    if(!worker_id || worker_id==='null') return res.json([]);
const jobs = await Job.find({
  worker_id: worker_id,
      status: { $in: ['pending', 'accepted'] },
      job_date: { $gte: startOfDay, $lte: endOfDay }
    });
    res.json(jobs.map(j => ({ time_slot: j.time_slot })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
