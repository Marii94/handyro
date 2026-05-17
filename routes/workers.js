const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');

// Mapare categorii -> specializations
const catMap = {
  'Instalații sanitare': ['Instalații sanitare', 'Toate categoriile'],
  'Instalații electrice': ['Instalații electrice', 'Toate categoriile'],
  'Renovări & zugrăveală': ['Renovări & zugrăveală', 'Renovari', 'Zugraveli', 'Toate categoriile'],
  'Curățenie profesională': ['Curățenie profesională', 'Curatenie', 'Toate categoriile'],
  'Tâmplărie & mobilier': ['Tâmplărie & mobilier', 'Tamplarie', 'Toate categoriile'],
  'Mentenanță generală': ['Mentenanță generală', 'General', 'Toate categoriile'],
};

// GET /api/workers
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const workers = await db.workers.find({});
    
    let result = await Promise.all(workers.map(async w => {
      const u = await db.users.findOne({ _id: w.user_id });
      return { ...w, name: u?.name, email: u?.email, status: u?.status };
    }));

    // Filtreaza doar cei activi
    result = result.filter(w => w.status === 'active');

    // Filtreaza dupa categorie daca e specificata
    if (category && catMap[category]) {
      const allowed = catMap[category];
      result = result.filter(w => {
        const spec = w.specialization || '';
        return allowed.some(a => spec.includes(a) || a.includes(spec));
      });
    }

    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/price', auth, requireRole('admin'), async (req, res) => {
  try {
    const price = Number(req.body.price_per_job || req.body.price_per_hour);
    if (!price || price < 0) return res.status(400).json({ error: 'Preț invalid' });
    await db.workers.update({ _id: req.params.id }, { $set: { price_per_job: price } });
    res.json({ message: 'Preț actualizat', price_per_job: price });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/me/dashboard', auth, requireRole('meserias'), async (req, res) => {
  try {
    const worker = await db.workers.findOne({ user_id: req.user.id });
    if (!worker) return res.status(404).json({ error: 'Profil meșter negăsit' });
    const allJobs = await db.jobs.find({ worker_id: worker._id });
    const jobs = await Promise.all(allJobs.map(async j => {
      const client = await db.users.findOne({ _id: j.client_id });
      return { ...j, client_name: client?.name };
    }));
    const allConvs = await db.conversations.find({ worker_id: req.user.id });
    let unread = 0;
    for (const c of allConvs) {
      const cnt = await db.messages.count({ conversation_id: c._id, sender_id: { $ne: req.user.id }, is_read: false });
      unread += cnt;
    }
    res.json({ worker, jobs, unread_messages: unread });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
