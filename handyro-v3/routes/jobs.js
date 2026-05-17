const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');

router.post('/', auth, requireRole('client'), async (req, res) => {
  try {
    const { category, description, worker_id, urgency, time_slot, photos } = req.body;
    if (!category) return res.status(400).json({ error: 'Categoria este obligatorie' });
    if (!description?.trim()) return res.status(400).json({ error: 'Descrierea este obligatorie' });
    const job = await db.jobs.insert({
      client_id: req.user.id, worker_id: worker_id||null,
      category, description: description.trim(),
      urgency: urgency||'normal', time_slot: time_slot||'Orice interval',
      photos: Array.isArray(photos) ? photos : [],
      status: 'pending', city: 'București', created_at: new Date().toISOString()
    });
    if (worker_id) {
      const w = await db.workers.findOne({ _id: worker_id });
      if (w) await db.conversations.insert({ job_id: job._id, client_id: req.user.id, worker_id: w.user_id, created_at: new Date().toISOString() });
    }
    res.status(201).json({ id: job._id, message: 'Cerere trimisă cu succes!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/', auth, async (req, res) => {
  try {
    let jobs = [];
    if (req.user.role === 'admin') {
      jobs = await db.jobs.find({});
    } else if (req.user.role === 'meserias') {
      const worker = await db.workers.findOne({ user_id: req.user.id });
      jobs = await db.jobs.find({ worker_id: worker?._id });
    } else {
      jobs = await db.jobs.find({ client_id: req.user.id });
    }
    jobs = await Promise.all(jobs.map(async j => {
      const client = await db.users.findOne({ _id: j.client_id });
      let workerName = null;
      if (j.worker_id) { const w = await db.workers.findOne({ _id: j.worker_id }); const wu = w ? await db.users.findOne({ _id: w.user_id }) : null; workerName = wu?.name; }
      return { ...j, client_name: client?.name, worker_name: workerName };
    }));
    jobs.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(jobs);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/accept', auth, requireRole('meserias'), async (req, res) => {
  try {
    const worker = await db.workers.findOne({ user_id: req.user.id });
    const job = await db.jobs.findOne({ _id: req.params.id });
    if (!job) return res.status(404).json({ error: 'Job negăsit' });
    await db.jobs.update({ _id: req.params.id }, { $set: { status: 'accepted', worker_id: worker._id } });
    const existing = await db.conversations.findOne({ job_id: req.params.id });
    if (!existing) await db.conversations.insert({ job_id: req.params.id, client_id: job.client_id, worker_id: req.user.id, created_at: new Date().toISOString() });
    res.json({ message: 'Job acceptat!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    await db.jobs.remove({ _id: req.params.id });
    res.json({ message: 'Job șters' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
