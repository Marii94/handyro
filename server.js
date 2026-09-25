const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const { notifyAdmin, sendEmail } = require('./services/notify');

// Conecteaza MongoDB
require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/workers', require('./routes/workers'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/subcats', require('./routes/subcats'));
app.use('/api/payments', require('./routes/payments'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '6.0.0', db: 'MongoDB Atlas' }));
// Stats grafice
app.get('/api/stats/grafice', async (req, res) => {
  try {
    const jwt3 = require('jsonwebtoken');
    const token = req.cookies?.token || req.headers?.authorization?.split(' ')[1];
    const decoded = jwt3.verify(token, process.env.JWT_SECRET || 'handyro_secret_2026');
    const { Job: JobModel, Worker: WorkerModel } = require('./db');
    const azi = new Date();
    const startSaptCurenta = new Date(azi);
    startSaptCurenta.setDate(azi.getDate() - azi.getDay());
    startSaptCurenta.setHours(0,0,0,0);
    const startSaptTrecuta = new Date(startSaptCurenta);
    startSaptTrecuta.setDate(startSaptTrecuta.getDate() - 7);
    const endSaptTrecuta = new Date(startSaptCurenta);
    let filter = {};
    if(decoded.role === 'meserias') {
      const w = await WorkerModel.findOne({ user_id: decoded.id });
      if(w) filter.worker_id = w._id;
    }
    const jobsCurente = await JobModel.find({ ...filter, createdAt: { $gte: startSaptCurenta } });
    const jobsTrecute = await JobModel.find({ ...filter, createdAt: { $gte: startSaptTrecuta, $lt: endSaptTrecuta } });
    const zile = ['Dum','Lun','Mar','Mie','Joi','Vin','Sâm'];
    const intrariCurente = Array(7).fill(0);
    const intrariTrecute = Array(7).fill(0);
    const incasariCurente = Array(7).fill(0);
    const incasariTrecute = Array(7).fill(0);
    jobsCurente.forEach(j => {
      const zi = new Date(j.createdAt).getDay();
      intrariCurente[zi]++;
      if(j.subcat_price) incasariCurente[zi] += j.subcat_price;
    });
    jobsTrecute.forEach(j => {
      const zi = new Date(j.createdAt).getDay();
      intrariTrecute[zi]++;
      if(j.subcat_price) incasariTrecute[zi] += j.subcat_price;
    });
    res.json({ zile, intrariCurente, intrariTrecute, incasariCurente, incasariTrecute });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Contact messages ──────────────────────────────────────────────────────────
// IMPORTANT: aceste rute trebuie să fie ÎNAINTE de app.get('*', ...)
const { ContactMsg } = require('./db');

app.post('/api/contact', async (req, res) => {
  try {
    const { content, name, email } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Mesajul e gol' });
    let userId = null, userName = name, userEmail = email;
    try {
      const jwt = require('jsonwebtoken');
      const token = req.cookies?.token || req.headers?.authorization?.split(' ')[1];
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'handyro_secret_2026');
        userId = decoded.id;
        userName = decoded.name;
        userEmail = decoded.email;
      }
    } catch(e) {}
    const msg = await ContactMsg.create({
      sender_id: userId,
      sender_name: userName || 'Anonim',
      sender_email: userEmail || '',
      content: content.trim()
    });

    // Notificare admin — fire-and-forget, nu blocăm răspunsul către utilizator.
    notifyAdmin(
      `📩 Mesaj nou de contact`,
      `De la: ${userName || 'Anonim'} (${userEmail || 'fără email'})\n` +
      `Mesaj: ${content.trim()}`
    ).catch(() => {});

    res.status(201).json({ message: 'Mesaj trimis!', id: msg._id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/contact', async (req, res) => {
  try {
    const msgs = await ContactMsg.find({}).sort({ createdAt: -1 });
    res.json(msgs);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/contact/:id', async (req, res) => {
  try {
    const { reply } = req.body;
    if (!reply?.trim()) return res.status(400).json({ error: 'Răspunsul e gol' });
    const msg = await ContactMsg.findByIdAndUpdate(
      req.params.id,
      { reply: reply.trim(), is_read: true },
      { new: true }
    );
    if (!msg) return res.status(404).json({ error: 'Mesaj negăsit' });

    // Email către clientul care a scris mesajul inițial, cu răspunsul adminului.
    if (msg.sender_email) {
      sendEmail(
        msg.sender_email,
        `💬 Ai primit un răspuns — HandyRO`,
        `Bună, ${msg.sender_name || ''}!\n\n` +
        `Ai primit un răspuns la mesajul tău de pe HandyRO:\n\n` +
        `Mesajul tău: "${msg.content}"\n` +
        `Răspuns: "${reply.trim()}"\n\n` +
        `Poți continua conversația direct pe handyro.ro, pagina de Contact.`
      ).catch(() => {});
    }

    res.json({ message: 'Răspuns salvat' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Worker subcat prices ──────────────────────────────────────────────────────
const { WorkerSubcatPrice, SubcatPrice: SC } = require('./db');
const jwt2 = require('jsonwebtoken');

function adminAuth(req, res, next) {
  try {
    const token = req.cookies?.token || req.headers?.authorization?.split(' ')[1];
    const decoded = jwt2.verify(token, process.env.JWT_SECRET || 'handyro_secret_2026');
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    req.user = decoded;
    next();
  } catch(e) { res.status(401).json({ error: 'Unauthorized' }); }
}

app.get('/api/worker-prices/:workerId', adminAuth, async (req, res) => {
  try {
    const prices = await WorkerSubcatPrice.find({ worker_id: req.params.workerId }).populate('subcat_id');
    res.json(prices);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/worker-prices', adminAuth, async (req, res) => {
  try {
    const { worker_id, subcat_id, price } = req.body;
    const p = Number(price);
    if (!p || p < 0) return res.status(400).json({ error: 'Pret invalid' });
    await WorkerSubcatPrice.findOneAndUpdate(
      { worker_id, subcat_id },
      { price: p },
      { upsert: true, new: true }
    );
    res.json({ message: 'Salvat', price: p });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/worker-subcats/:workerId/:category', async (req, res) => {
  try {
    const subcats = await SC.find({ category: req.params.category }).sort({ order: 1 });
    const workerPrices = await WorkerSubcatPrice.find({ worker_id: req.params.workerId });
    const result = subcats.map(s => {
      const wp = workerPrices.find(p => String(p.subcat_id) === String(s._id));
      return { _id: s._id, name: s.name, category: s.category, price: wp ? wp.price : s.price };
    });
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Wildcard — TREBUIE să fie ULTIMA rută ─────────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log('HandyRO v6 pornit pe http://localhost:' + PORT));

// ── Returnare automată a banilor blocați ──────────────────────────────────────
// Dacă un job nu e finalizat în maxim 2 zile lucrătoare de la creare, autorizarea
// de card se anulează automat și clientul primește banii înapoi (nu au fost
// niciodată retrași efectiv, doar rezervați — anularea eliberează rezervarea).
function addBusinessDays(date, days) {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++; // sare peste sâmbătă/duminică
  }
  return result;
}

async function releaseExpiredHolds() {
  try {
    const { Job: JobModel, User: UserModel } = require('./db');
    const { cancelHold } = require('./services/stripe');
    const candidates = await JobModel.find({ payment_status: 'authorized', status: { $ne: 'completed' } });
    for (const job of candidates) {
      const deadline = addBusinessDays(job.createdAt, 2);
      if (new Date() < deadline) continue; // încă în termen, nu facem nimic
      try {
        await cancelHold(job.payment_intent_id);
        job.payment_status = 'canceled';
        job.status = 'cancelled';
        await job.save();
        const client = await UserModel.findById(job.client_id);
        if (client?.email) {
          sendEmail(
            client.email,
            `↩️ Banii ți-au fost returnați — HandyRO`,
            `Bună, ${client.name}!\n\nLucrarea "${job.category}" nu a fost finalizată în termen de 2 zile lucrătoare, ` +
            `așa că suma blocată pe cardul tău (${job.amount_lei || ''} lei) a fost eliberată automat. ` +
            `Nu ai fost taxat.\n\nPoți trimite oricând o cerere nouă pe handyro.ro.`
          ).catch(() => {});
        }
        console.log('[payments] Autorizare anulată automat pentru job', job._id.toString());
      } catch (e) {
        console.error('[payments] Eroare la anularea automată a autorizării pentru job', job._id.toString(), e.message);
      }
    }
  } catch (e) {
    console.error('[payments] Eroare la verificarea autorizărilor expirate:', e.message);
  }
}

// Verificăm la fiecare 6 ore. Rulăm și o dată la pornirea serverului.
setInterval(releaseExpiredHolds, 6 * 60 * 60 * 1000);
releaseExpiredHolds();

module.exports = app;
