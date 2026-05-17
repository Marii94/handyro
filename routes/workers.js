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
      return { _id: w._id, name: u.name, specialization: w.specialization, rating: w.rating, reviews_count: w.reviews_count, city: w.city, price_for_category: price };
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
      return { ...j.toObject(), client_name: client?.name };
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

module.exports = router;
