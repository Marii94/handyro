const express = require('express');
const router = express.Router();
const db = require('../db').db;
const { auth, requireRole } = require('../middleware/auth');

// GET /api/categories — toate categoriile cu preturi
router.get('/', async (req, res) => {
  try {
    const cats = await db.categories.find({});
    cats.sort((a,b) => a.name.localeCompare(b.name));
    res.json(cats);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/categories/:id — admin editeaza pretul unei categorii
router.patch('/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const price = Number(req.body.price);
    if (!price || price < 1) return res.status(400).json({ error: 'Preț invalid' });
    await db.categories.update({ _id: req.params.id }, { $set: { price } });
    res.json({ message: 'Preț actualizat', price });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
