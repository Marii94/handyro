const express = require('express');
const router = express.Router();
const { User, Worker, Job, Conversation } = require('../db');
const { auth, requireRole } = require('../middleware/auth');

router.post('/', auth, requireRole('client'), async (req, res) => {
  try {
    const { category, description, worker_id, urgency, time_slot, photos, subcat_name, subcat_price } = req.body;
    if (!category) return res.status(400).json({ error: 'Categoria este obligatorie' });
    if (!description?.trim()) return res.status(400).json({ error: 'Descrierea este obligatorie' });
    const job = await Job.create({ client_id: req.user.id, worker_id: worker_id||null, category, description: description.trim(), urgency: urgency||'normal', time_slot: time_slot||'Orice interval', photos: Array.isArray(photos)?photos:[], subcat_name, subcat_price, city: 'București' });
    if (worker_id) {
      const w = await Worker.findById(worker_id);
      if (w) await Conversation.create({ job_id: job._id, client_id: req.user.id, worker_id: w.user_id });
    }
    res.status(201).json({ id: job._id, message: 'Cerere trimisă cu succes!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/', auth, async (req, res) => {
  try {
    let jobs;
    if (req.user.role === 'admin') jobs = await Job.find({});
    else if (req.user.role === 'meserias') { const w = await Worker.findOne({ user_id: req.user.id }); jobs = await Job.find({ worker_id: w?._id }); }
    else jobs = await Job.find({ client_id: req.user.id });
    const result = await Promise.all(jobs.map(async j => {
      const client = await User.findById(j.client_id);
      let workerName = null;
      if (j.worker_id) { const w = await Worker.findById(j.worker_id); const wu = w ? await User.findById(w.user_id) : null; workerName = wu?.name; }
      const { Review } = require('../db');
      const review = await Review.findOne({ job_id: j._id });
      return { ...j.toObject(), client_name: client?.name, worker_name: workerName, review: review||null };
    }));
    result.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/accept', auth, requireRole('meserias'), async (req, res) => {
  try {
    const worker = await Worker.findOne({ user_id: req.user.id });
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job negăsit' });
    await Job.findByIdAndUpdate(req.params.id, { status: 'accepted', worker_id: worker._id });
    const existing = await Conversation.findOne({ job_id: req.params.id });
    if (!existing) await Conversation.create({ job_id: req.params.id, client_id: job.client_id, worker_id: req.user.id });
    res.json({ message: 'Job acceptat!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/complete', auth, requireRole('meserias'), async (req, res) => {
  try {
    await Job.findByIdAndUpdate(req.params.id, { status: 'completed', completed_at: new Date() });
    res.json({ message: 'Job finalizat!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    await Job.findByIdAndDelete(req.params.id);
    res.json({ message: 'Job șters' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
