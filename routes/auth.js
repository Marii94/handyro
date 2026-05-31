const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Worker } = require('../db');
const { auth } = require('../middleware/auth');
const { JWT_SECRET } = require('../middleware/auth');

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
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
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
const user = await User.create({ name: name.trim(), email: email.toLowerCase().trim(), password: bcrypt.hashSync(password, 10), role, status, phone, horeca_name, horeca_type });
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
      return res.status(201).json({ message: 'Cont creat! Așteaptă aprobarea adminului.' });
    }
    const token = jwt.sign({ id: user._id, name: user.name, email: user.email, role }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, maxAge: 7*24*60*60*1000, sameSite: 'lax' });
    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User negăsit' });
    res.json({ id: user._id, name: user.name, email: user.email, role: user.role, assigned_worker: user.assigned_worker, horeca_name: user.horeca_name, horeca_type: user.horeca_type });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Deconectat' });
});

module.exports = router;
