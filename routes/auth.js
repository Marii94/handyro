const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Worker } = require('../db');
const { auth } = require('../middleware/auth');
const { JWT_SECRET } = require('../middleware/auth');
const { sendEmail } = require('../services/notify');

const APP_URL = process.env.APP_URL || 'https://handyro.ro';

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Câmpuri lipsă' });
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Email sau parolă incorectă' });
    if (user.status === 'blocked') return res.status(403).json({ error: 'Contul tău a fost blocat' });
    if (user.status === 'pending') return res.status(403).json({ error: 'Contul tău așteaptă aprobarea adminului' });
    const token = jwt.sign({ id: user._id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, maxAge: 7*24*60*60*1000, sameSite: 'lax' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, email_verified: user.email_verified } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Câmpuri lipsă' });
    if(!['client','meserias','admin','horeca'].includes(role)) return res.status(400).json({ error: 'Rol invalid' });
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(409).json({ error: 'Email-ul este deja înregistrat' });
    const status = role === 'meserias' ? 'pending' : 'active';
const horeca_name = req.body.horeca_name || '';
const horeca_type = req.body.horeca_type || '';
   const phone = req.body.phone || '';

    // Token de verificare email — trimis pe email, confirmat prin link.
    const emailVerifyToken = crypto.randomBytes(32).toString('hex');

    const user = await User.create({ name: name.trim(), email: email.toLowerCase().trim(), password: bcrypt.hashSync(password, 10), role, status, phone, horeca_name, horeca_type, email_verified: false, email_verify_token: emailVerifyToken });

    // Nu blocăm răspunsul dacă trimiterea emailului eșuează.
    sendEmail(
      user.email,
      'Confirmă adresa de email — HandyRO',
      `Bună, ${user.name}!\n\n` +
      `Îți mulțumim că te-ai înregistrat pe HandyRO. Confirmă adresa ta de email apăsând pe linkul de mai jos:\n\n` +
      `${APP_URL}/api/auth/verify-email/${emailVerifyToken}\n\n` +
      `Dacă nu tu ai creat acest cont, poți ignora acest email.`
    ).catch(() => {});

    if (role === 'meserias') {
      const spec = req.body.specialization || 'General';
      const city = req.body.city || 'București';
      const categories = req.body.categories || [];
      const pfa_name = req.body.pfa_name || '';
      const cui = req.body.cui || '';
      const iban = req.body.iban || '';
      await Worker.create({
        user_id: user._id,
        city,
        specialization: spec,
        categories,
        pfa_name,
        cui,
        iban,
      });
      return res.status(201).json({ message: 'Cont creat! Verifică-ți emailul, apoi așteaptă aprobarea adminului.' });
    }
    const token = jwt.sign({ id: user._id, name: user.name, email: user.email, role }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, maxAge: 7*24*60*60*1000, sameSite: 'lax' });
    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role, email_verified: false } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Confirmarea adresei de email — accesată direct din linkul trimis pe email.
router.get('/verify-email/:token', async (req, res) => {
  try {
    const user = await User.findOne({ email_verify_token: req.params.token });
    if (!user) {
      return res.status(400).send(`<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Link invalid</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:4rem 1rem;">
          <h1>Link invalid sau expirat</h1>
          <p>Acest link de confirmare nu mai este valabil. Dacă emailul tău nu e încă verificat, poți încerca să te loghezi din nou pentru a primi un link nou.</p>
          <a href="${APP_URL}">Înapoi la HandyRO</a>
        </body></html>`);
    }
    user.email_verified = true;
    user.email_verify_token = null;
    await user.save();
    res.send(`<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Email confirmat</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:4rem 1rem;">
        <h1>✅ Email confirmat!</h1>
        <p>Adresa ta de email a fost verificată cu succes.</p>
        <a href="${APP_URL}">Înapoi la HandyRO</a>
      </body></html>`);
  } catch(e) { res.status(500).send('Eroare la verificare: ' + e.message); }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User negăsit' });
    res.json({ id: user._id, name: user.name, email: user.email, role: user.role, assigned_worker: user.assigned_worker, horeca_name: user.horeca_name, horeca_type: user.horeca_type, email_verified: user.email_verified });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Deconectat' });
});

module.exports = router;
