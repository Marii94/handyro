const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');

// POST /api/reviews — client lasa review dupa job finalizat
router.post('/', auth, requireRole('client'), async (req, res) => {
  try {
    const { job_id, stars } = req.body;
    if (!job_id || !stars || stars < 1 || stars > 5) return res.status(400).json({ error: 'Date invalide' });

    const job = await db.jobs.findOne({ _id: job_id, client_id: req.user.id });
    if (!job) return res.status(404).json({ error: 'Job negăsit' });
    if (job.status !== 'completed') return res.status(400).json({ error: 'Lucrarea nu este finalizată încă' });

    // Verifica daca exista deja review
    const existing = await db.reviews.findOne({ job_id });
    if (existing) return res.status(400).json({ error: 'Ai lăsat deja un review pentru această lucrare' });

    // Salveaza review
    const review = await db.reviews.insert({
      job_id, client_id: req.user.id, worker_id: job.worker_id,
      stars: Number(stars), created_at: new Date().toISOString()
    });

    // Recalculeaza rating meserias
    const allReviews = await db.reviews.find({ worker_id: job.worker_id });
    const avg = allReviews.reduce((s, r) => s + r.stars, 0) / allReviews.length;
    await db.workers.update({ _id: job.worker_id }, { $set: { rating: Math.round(avg * 10) / 10, reviews_count: allReviews.length } });

    res.status(201).json({ message: 'Review trimis! Mulțumim!', review });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/reviews/worker/:workerId — review-urile unui meserias
router.get('/worker/:workerId', async (req, res) => {
  try {
    const reviews = await db.reviews.find({ worker_id: req.params.workerId });
    const withNames = await Promise.all(reviews.map(async r => {
      const client = await db.users.findOne({ _id: r.client_id });
      const job = await db.jobs.findOne({ _id: r.job_id });
      return { ...r, client_name: client?.name, category: job?.category };
    }));
    withNames.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(withNames);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
