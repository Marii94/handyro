const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

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

app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '6.0.0', db: 'MongoDB Atlas' }));

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
module.exports = app;
