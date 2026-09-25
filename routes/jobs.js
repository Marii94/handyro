const express = require('express');
const router = express.Router();
const { User, Worker, Job, Conversation } = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { notifyAdmin, sendEmail } = require('../services/notify');
const { captureHold, cancelHold, retrieveIntent } = require('../services/stripe');

router.post('/', auth, requireRole('client', 'horeca'), async (req, res) => {
  try {
    const { category, description, worker_id, urgency, time_slot, photos, subcat_name, subcat_price, job_date, payment_intent_id } = req.body;
    if (!category) return res.status(400).json({ error: 'Categoria este obligatorie' });
    if (!description?.trim()) return res.status(400).json({ error: 'Descrierea este obligatorie' });
    if (!payment_intent_id) return res.status(400).json({ error: 'Plata cu cardul este obligatorie pentru a trimite o cerere.' });

    // Verificăm la Stripe că autorizarea cardului chiar a reușit (status 'requires_capture')
    // înainte de a crea jobul — nu avem încredere doar în ce trimite frontend-ul.
    let intent;
    try {
      intent = await retrieveIntent(payment_intent_id);
    } catch (e) {
      return res.status(400).json({ error: 'Nu am putut verifica plata. Încearcă din nou.' });
    }
    if (intent.status !== 'requires_capture') {
      return res.status(400).json({ error: 'Plata nu a fost autorizată cu succes. Încearcă din nou.' });
    }

    const amountLei = intent.amount / 100;
    const job = await Job.create({ client_id: req.user.id, worker_id: worker_id||null, category, description: description.trim(), urgency: urgency||'normal', time_slot: time_slot||'Orice interval', photos: Array.isArray(photos)?photos:[], subcat_name, subcat_price, city: 'București', job_date: job_date?new Date(job_date):new Date(), payment_intent_id, payment_status: 'authorized', amount_lei: amountLei });
    if (worker_id) {
      const w = await Worker.findById(worker_id);
      if (w) await Conversation.create({ job_id: job._id, client_id: req.user.id, worker_id: w.user_id });
    }

    // Notificare admin — nu așteptăm rezultatul (fire-and-forget), ca un eventual
    // eșec de email/WhatsApp să nu întârzie sau să blocheze răspunsul către client.
    notifyAdmin(
      `🔧 Job nou — ${category}`,
      `Client: ${req.user.name || req.user.email}\n` +
      `Categorie: ${category}${subcat_name ? ' — ' + subcat_name : ''}\n` +
      `Urgență: ${urgency === 'urgent' ? 'URGENT' : 'Normal'}\n` +
      `Interval: ${time_slot || 'Orice interval'}\n` +
      `Sumă blocată pe card: ${amountLei} lei\n` +
      `Descriere: ${description.trim()}`
    ).catch(() => {});

    res.status(201).json({ id: job._id, message: 'Cerere trimisă cu succes! Suma a fost blocată pe cardul tău.' });
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
      const jobj = j.toObject(); return { ...jobj, id: String(jobj._id), client_name: client?.name, worker_name: workerName, review: review||null };
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
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job negăsit' });
    if (job.payment_intent_id && job.payment_status === 'authorized') {
      try {
        await captureHold(job.payment_intent_id);
      } catch (e) {
        return res.status(500).json({ error: 'Job-ul e marcat gata, dar capturarea plății a eșuat: ' + e.message });
      }
      job.payment_status = 'captured';
    }
    job.status = 'completed';
    job.completed_at = new Date();
    await job.save();

    const client = await User.findById(job.client_id);
    if (client?.email) {
      sendEmail(
        client.email,
        `✅ Lucrarea ta a fost finalizată — HandyRO`,
        `Bună, ${client.name}!\n\nLucrarea "${job.category}${job.subcat_name ? ' — ' + job.subcat_name : ''}" a fost marcată ca finalizată de meșter.\n` +
        (job.amount_lei ? `Suma de ${job.amount_lei} lei a fost încasată de pe cardul tău.\n` : '') +
        `Poți lăsa un review din contul tău pe handyro.ro.`
      ).catch(() => {});
    }

    res.json({ message: 'Job finalizat!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (job && job.payment_intent_id && job.payment_status === 'authorized') {
      try { await cancelHold(job.payment_intent_id); } catch (e) {}
    }
    await Job.findByIdAndDelete(req.params.id);
    res.json({ message: 'Job șters' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
