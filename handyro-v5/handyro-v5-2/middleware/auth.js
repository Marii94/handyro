const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'handyro_secret_2026';

function auth(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Neautentificat' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalid' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Acces interzis' });
    }
    next();
  };
}

module.exports = { auth, requireRole, JWT_SECRET };
