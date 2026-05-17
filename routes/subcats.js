const express = require('express');
const router = express.Router();
const { SubcatPrice } = require('../db');
const { auth, requireRole } = require('../middleware/auth');

// GET /api/subcats?category=X — subcategorii pentru o categorie
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const query = category ? { category } : {};
    const subcats = await SubcatPrice.find(query).sort({ category: 1, order: 1 });
    res.json(subcats);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/subcats/:id — admin editeaza pretul
router.patch('/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const { price, name } = req.body;
    const update = {};
    if (price !== undefined) update.price = Number(price);
    if (name !== undefined) update.name = name;
    if (!update.price || update.price < 1) return res.status(400).json({ error: 'Preț invalid' });
    const sub = await SubcatPrice.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!sub) return res.status(404).json({ error: 'Subcategoria nu există' });
    res.json({ message: 'Actualizat ✓', sub });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
