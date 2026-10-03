const express = require('express');
const router = express.Router();
const { User, Worker, Job, Conversation } = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { notifyAdmin, sendEmail } = require('../services/notify');
const PDFDocument = require('pdfkit');
const { captureHold, cancelHold, retrieveIntent } = require('../services/stripe');

router.post('/', auth, requireRole('client', 'horeca'), async (req, res) => {
  try {
    const { category, description, worker_id, urgency, time_slot, photos, subcat_name, subcat_price, job_date, payment_intent_id, price_pending, exact_address, city } = req.body;
    if (!category) return res.status(400).json({ error: 'Categoria este obligatorie' });
    if (!description?.trim()) return res.status(400).json({ error: 'Descrierea este obligatorie' });

    let job;
    if (price_pending) {
      // "Altceva" — nu există un preț fix, deci nu se cere nicio autorizare de card.
      // Jobul se creează direct, iar prețul se stabilește separat, prin discuție cu adminul.
      job = await Job.create({ client_id: req.user.id, worker_id: worker_id||null, category, description: description.trim(), urgency: urgency||'normal', time_slot: time_slot||'Orice interval', photos: Array.isArray(photos)?photos:[], subcat_name: subcat_name||'Altceva (preț stabilit cu adminul)', subcat_price: null, city: city||'București', exact_address: exact_address||'', job_date: job_date?new Date(job_date):new Date(), payment_intent_id: null, payment_status: 'pending_quote', amount_lei: null });
    } else {
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
      const splitViaConnect = intent.metadata && intent.metadata.split === 'connect';
      job = await Job.create({ client_id: req.user.id, worker_id: worker_id||null, category, description: description.trim(), urgency: urgency||'normal', time_slot: time_slot||'Orice interval', photos: Array.isArray(photos)?photos:[], subcat_name, subcat_price, city: city||'București', exact_address: exact_address||'', job_date: job_date?new Date(job_date):new Date(), payment_intent_id, payment_status: 'authorized', amount_lei: amountLei, split_via_connect: splitViaConnect });
    }
    if (worker_id) {
      const w = await Worker.findById(worker_id);
      if (w) await Conversation.create({ job_id: job._id, client_id: req.user.id, worker_id: w.user_id });
    }

    // Notificare admin — nu așteptăm rezultatul (fire-and-forget), ca un eventual
    // eșec de email/WhatsApp să nu întârzie sau să blocheze răspunsul către client.
    notifyAdmin(
      price_pending ? `⚠️ Job nou — PREȚ DE STABILIT — ${category}` : `🔧 Job nou — ${category}`,
      `Client: ${req.user.name || req.user.email}\n` +
      `Categorie: ${category}${subcat_name ? ' — ' + subcat_name : ''}\n` +
      `Zonă: ${city || 'București'}\n` +
      `Adresă exactă: ${exact_address || '(neprecizată)'}\n` +
      `Urgență: ${urgency === 'urgent' ? 'URGENT' : 'Normal'}\n` +
      `Interval: ${time_slot || 'Orice interval'}\n` +
      (price_pending
        ? `⚠️ Necesită contactarea clientului pentru a stabili prețul lucrării.\n`
        : `Sumă blocată pe card: ${job.amount_lei} lei\n`) +
      `Descriere: ${description.trim()}`
    ).catch(() => {});

    res.status(201).json({
      id: job._id,
      message: price_pending
        ? 'Cerere trimisă cu succes! Adminul te va contacta pentru a stabili prețul.'
        : 'Cerere trimisă cu succes! Suma a fost blocată pe cardul tău.'
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/report', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Scrie ce s-a întâmplat.' });
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job negăsit' });
    const isClient = String(job.client_id) === String(req.user.id);
    let isWorker = false;
    if (!isClient && job.worker_id) {
      const w = await Worker.findById(job.worker_id);
      isWorker = w && String(w.user_id) === String(req.user.id);
    }
    if (!isClient && !isWorker) return res.status(403).json({ error: 'Nu ai acces la acest job.' });

    notifyAdmin(
      `🚨 RAPORT — ${isClient ? 'de la client' : 'de la meșter'} — ${job.category}`,
      `Raportat de: ${req.user.name || req.user.email} (${isClient ? 'client' : 'meșter'})\n` +
      `Job: ${job.category}${job.subcat_name ? ' — ' + job.subcat_name : ''}\n` +
      `Adresă: ${job.exact_address || '(neprecizată)'} — ${job.city || ''}\n\n` +
      `Mesaj:\n${message.trim()}`
    ).catch(() => {});

    res.json({ message: 'Raport trimis. Adminul va analiza situația cât mai curând.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Generează PDF-ul de chitanță ca Buffer în memorie — folosit atât pentru
// descărcarea manuală (ruta de mai jos), cât și pentru atașarea automată la
// emailul trimis clientului când jobul se finalizează.
async function buildReceiptPdfBuffer(job, client, workerName) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(22).fillColor('#0F1F3D').text('HandyRO', { continued: false });
    doc.fontSize(10).fillColor('#6B7280').text('handyro.ro · admin@handyro.ro');
    doc.moveDown(1.5);

    doc.fontSize(16).fillColor('#0F1F3D').text('CHITANȚĂ', { underline: false });
    doc.fontSize(9).fillColor('#E24B4A').text('Document informativ — nu este factură fiscală.');
    doc.moveDown(1);

    doc.fontSize(10).fillColor('#0F1F3D');
    doc.text(`Nr. referință: ${job._id}`);
    doc.text(`Data: ${(job.completed_at || job.updatedAt || new Date()).toLocaleDateString('ro-RO')}`);
    doc.moveDown(0.5);
    doc.text(`Client: ${client?.name || ''}`);
    doc.text(`Email: ${client?.email || ''}`);
    doc.moveDown(0.5);
    doc.text(`Meșter: ${workerName || '-'}`);
    doc.text(`Serviciu: ${job.category}${job.subcat_name ? ' — ' + job.subcat_name : ''}`);
    doc.text(`Adresă: ${job.exact_address || '-'} — ${job.city || ''}`);
    doc.moveDown(1);

    doc.fontSize(13).fillColor('#0F1F3D').text(`Sumă plătită: ${job.amount_lei} lei`, { bold: true });
    doc.fontSize(9).fillColor('#6B7280').text('Plată efectuată online, cu cardul, prin Stripe.');
    doc.moveDown(2);

    doc.fontSize(8).fillColor('#9CA3AF').text('Această chitanță confirmă efectuarea plății prin platforma HandyRO. Nu reprezintă factură fiscală în sensul legii; pentru factură fiscală, contactați admin@handyro.ro.');

    doc.end();
  });
}

router.get('/:id/receipt', auth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job negăsit' });

    const isClient = String(job.client_id) === String(req.user.id);
    if (!isClient && req.user.role !== 'admin') return res.status(403).json({ error: 'Nu ai acces la această chitanță.' });
    if (job.payment_status !== 'captured' || !job.amount_lei) {
      return res.status(400).json({ error: 'Chitanța e disponibilă doar după ce lucrarea e finalizată și plata încasată.' });
    }

    const client = await User.findById(job.client_id);
    let workerName = '';
    if (job.worker_id) {
      const w = await Worker.findById(job.worker_id);
      const wu = w ? await User.findById(w.user_id) : null;
      workerName = wu?.name || '';
    }

    const pdfBuffer = await buildReceiptPdfBuffer(job, client, workerName);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="chitanta-handyro-${job._id}.pdf"`);
    res.send(pdfBuffer);
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

router.patch('/:id/authorize-price', auth, requireRole('client', 'horeca'), async (req, res) => {
  try {
    const { payment_intent_id } = req.body;
    if (!payment_intent_id) return res.status(400).json({ error: 'Lipsește autorizarea de card.' });
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job negăsit' });
    if (String(job.client_id) !== String(req.user.id)) return res.status(403).json({ error: 'Acest job nu îți aparține.' });
    if (job.payment_status !== 'pending_quote' || !job.subcat_price) {
      return res.status(400).json({ error: 'Acest job nu are un preț stabilit de autorizat.' });
    }

    let intent;
    try {
      intent = await retrieveIntent(payment_intent_id);
    } catch (e) {
      return res.status(400).json({ error: 'Nu am putut verifica plata. Încearcă din nou.' });
    }
    if (intent.status !== 'requires_capture') {
      return res.status(400).json({ error: 'Autorizarea cardului nu a reușit. Încearcă din nou.' });
    }

    job.payment_intent_id = payment_intent_id;
    job.payment_status = 'authorized';
    job.amount_lei = intent.amount / 100;
    job.split_via_connect = !!(intent.metadata && intent.metadata.split === 'connect');
    await job.save();

    notifyAdmin(
      `✅ Client a autorizat prețul stabilit — ${job.category}`,
      `Client: ${req.user.name || req.user.email}\nSuma de ${job.amount_lei} lei a fost blocată pe cardul clientului. Meșterul poate începe lucrarea.`
    ).catch(() => {});

    res.json({ message: 'Plată autorizată cu succes! Meșterul poate începe lucrarea.' });
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

router.patch('/:id/on-the-way', auth, requireRole('meserias'), async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job negăsit' });
    if (job.status !== 'accepted') return res.status(400).json({ error: 'Jobul trebuie acceptat înainte să fie marcat ca "pe drum".' });
    job.status = 'on_the_way';
    await job.save();

    const client = await User.findById(job.client_id);
    if (client?.email) {
      sendEmail(
        client.email,
        `🚗 Meșterul e pe drum — HandyRO`,
        `Bună, ${client.name}!\n\nMeșterul tău pentru lucrarea "${job.category}"${job.subcat_name ? ' — ' + job.subcat_name : ''} este pe drum către tine.\n` +
        `Poți urmări discuția direct în chat, pe handyro.ro.`
      ).catch(() => {});
    }

    res.json({ message: 'Status actualizat: pe drum!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/complete', auth, requireRole('meserias'), async (req, res) => {
  try {
    const { completion_photos } = req.body;
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
    if (Array.isArray(completion_photos) && completion_photos.length) job.completion_photos = completion_photos;
    await job.save();

    const client = await User.findById(job.client_id);
    if (client?.email) {
      let attachments;
      if (job.payment_status === 'captured' && job.amount_lei) {
        try {
          const pdfBuffer = await buildReceiptPdfBuffer(job, client, req.user.name || '');
          attachments = [{ filename: `chitanta-handyro-${job._id}.pdf`, content: pdfBuffer }];
        } catch (e) {
          console.error('[jobs] Eroare la generarea chitanței pentru email:', e.message);
        }
      }
      sendEmail(
        client.email,
        `✅ Lucrarea ta a fost finalizată — HandyRO`,
        `Bună, ${client.name}!\n\nLucrarea "${job.category}${job.subcat_name ? ' — ' + job.subcat_name : ''}" a fost marcată ca finalizată de meșter.\n` +
        (job.amount_lei ? `Suma de ${job.amount_lei} lei a fost încasată de pe cardul tău.\n` : '') +
        (attachments ? `Chitanța e atașată la acest email.\n` : '') +
        (job.completion_photos && job.completion_photos.length ? `Meșterul a atașat poze cu lucrarea finalizată — le poți vedea în contul tău.\n` : '') +
        `Poți lăsa un review din contul tău pe handyro.ro.`,
        attachments
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
