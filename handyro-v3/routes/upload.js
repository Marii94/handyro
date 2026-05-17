const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auth } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg','image/png','image/webp','image/heic','image/gif'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Doar imagini sunt permise'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 3 }
});

// POST /api/upload/photos
router.post('/photos', auth, upload.array('photos', 3), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Nicio poza incarcata' });
  }
  const urls = req.files.map(f => '/uploads/' + f.filename);
  res.json({ urls, count: urls.length });
});

module.exports = router;
