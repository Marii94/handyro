const express = require('express');
const router = express.Router();
const { Job, Review, Worker } = require('../db');
const { auth, requireRole } = require('../middleware/auth');

router.post('/', auth, requireRole('client'), async (req, res) => {
  try {
    const { job_id, stars } = req.body;
    if (!job_id || !stars || stars < 1 || stars > 5) return res.status(400).json({ error: 'Date invalide' });
    const job = await Job.findOne({ _id: job_id, client_id: req.user.id });
    if (!job) return res.status(404).json({ error: 'Job negăsit' });
    if (job.status !== 'completed') return res.status(400).json({ error: 'Lucrarea nu este finalizată' });
    const existing = await Review.findOne({ job_id });
    if (existing) return res.status(400).json({ error: 'Ai lăsat deja un review' });
    const review = await Review.create({ job_id, client_id: req.user.id, worker_id: job.worker_id, stars: Number(stars) });
    const allReviews = await Review.find({ worker_id: job.worker_id });
    const avg = allReviews.reduce((s,r) => s+r.stars, 0) / allReviews.length;
    await Worker.findByIdAndUpdate(job.worker_id, { rating: Math.round(avg*10)/10, reviews_count: allReviews.length });
    res.status(201).json({ message: 'Review trimis!', review });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
