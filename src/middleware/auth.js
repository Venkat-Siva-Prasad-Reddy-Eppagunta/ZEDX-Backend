// auth.js
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET not set in .env');
  process.exit(1);
}

export const requireAuth = (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: 'Missing Authorization header' });

    const parts = header.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ error: 'Invalid Authorization format' });
    }

    const token = parts[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    // store userId on request
    req.userId = decoded.userId || decoded.id || decoded.sub || null;
    if (!req.userId) return res.status(401).json({ error: 'Invalid token payload' });

    next();
  } catch (err) {
    console.error('Auth middleware error', err);
    return res.status(401).json({ error: 'Unauthorized' });
  }
};