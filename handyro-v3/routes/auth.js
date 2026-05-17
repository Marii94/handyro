const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Câmpuri lipsă' });
    const user = await db.users.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: 'Email sau parolă incorectă' });
    if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Email sau parolă incorectă' });
    if (user.status === 'blocked') return res.status(403).json({ error: 'Contul tău a fost blocat' });
    if (user.status === 'pending') return res.status(403).json({ error: 'Contul tău așteaptă aprobarea adminului' });
    const token = jwt.sign({ id: user._id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, maxAge: 7*24*60*60*1000, sameSite: 'lax' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Câmpuri lipsă' });
    if (!['client','meserias'].includes(role)) return res.status(400).json({ error: 'Rol invalid' });
    const existing = await db.users.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(409).json({ error: 'Email-ul este deja înregistrat' });
    const hash = bcrypt.hashSync(password, 10);
    const status = role === 'meserias' ? 'pending' : 'active';
    const user = await db.users.insert({ name: name.trim(), email: email.toLowerCase().trim(), password: hash, role, status, created_at: new Date().toISOString() });
    if (role === 'meserias') {
      await db.workers.insert({ user_id: user._id, specialization: 'General', price_per_hour: 100, rating: 5.0, reviews_count: 0, city: 'București', available: true });
      return res.status(201).json({ message: 'Cont creat! Așteaptă aprobarea adminului.' });
    }
    const token = jwt.sign({ id: user._id, name: user.name, email: user.email, role }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, maxAge: 7*24*60*60*1000, sameSite: 'lax' });
    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Deconectat' });
});

module.exports = router;
