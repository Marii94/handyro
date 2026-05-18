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
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log('HandyRO v6 pornit pe http://localhost:' + PORT));
module.exports = app;

// Contact messages endpoint
const { ContactMsg } = require('./db');
app.post('/api/contact', async (req, res) => {
  try {
    const { content, name, email } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Mesajul e gol' });
    // Get user from token if logged in
    let userId = null, userName = name, userEmail = email;
    try {
      const jwt = require('jsonwebtoken');
      const token = req.cookies?.token || req.headers?.authorization?.split(' ')[1];
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'handyro_secret_2024');
        userId = decoded.id;
        userName = decoded.name;
        userEmail = decoded.email;
      }
    } catch(e) {}
    const msg = await ContactMsg.create({ sender_id: userId, sender_name: userName || 'Anonim', sender_email: userEmail || '', content: content.trim() });
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
    await ContactMsg.findByIdAndUpdate(req.params.id, { reply, is_read: true });
    res.json({ message: 'Răspuns salvat' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
