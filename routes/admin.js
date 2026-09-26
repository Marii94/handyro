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
        referral_source: w?.referral_source || null,
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

router.get('/payouts', async (req, res) => {
  try {
    // Doar joburile finalizate CU banii deja încasați (payment_status='captured')
    // intră la calcul — nu are sens să calculăm comisioane pe bani nici măcar retrași încă.
    const jobs = await Job.find({ payment_status: 'captured' }).sort({ completed_at: -1 });
    const result = await Promise.all(jobs.map(async j => {
      const worker = j.worker_id ? await Worker.findById(j.worker_id) : null;
      const workerUser = worker ? await User.findById(worker.user_id) : null;
      const amount = j.amount_lei || 0;
      const hasAgency = !!(worker && worker.referral_source);
      // Cu agenție: 70% meșter / 10% agenție / 20% platformă.
      // Fără agenție: 80% meșter / 20% platformă (nu există agenție de plătit).
      const workerShare = Math.round((hasAgency ? amount * 0.70 : amount * 0.80) * 100) / 100;
      const agencyShare = Math.round((hasAgency ? amount * 0.10 : 0) * 100) / 100;
      const platformShare = Math.round((amount - workerShare - agencyShare) * 100) / 100;
      return {
        job_id: j._id,
        category: j.category,
        subcat_name: j.subcat_name || '',
        completed_at: j.completed_at,
        amount_lei: amount,
        worker_name: workerUser?.name || 'Necunoscut',
        referral_source: worker?.referral_source || null,
        worker_share: workerShare,
        agency_share: agencyShare,
        platform_share: platformShare,
      };
    }));

    const totals = { worker_total: 0, agency_total: 0, platform_total: 0, by_agency: {} };
    result.forEach(r => {
      totals.worker_total += r.worker_share;
      totals.agency_total += r.agency_share;
      totals.platform_total += r.platform_share;
      if (r.referral_source) {
        totals.by_agency[r.referral_source] = (totals.by_agency[r.referral_source] || 0) + r.agency_share;
      }
    });

    res.json({ jobs: result, totals });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
