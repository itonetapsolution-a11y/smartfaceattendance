const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'face-attendance-local-dev-secret';
const COOKIE_NAME = 'admin_token';
const COOKIE_MAX_AGE = 8 * 60 * 60 * 1000; // 8 hours

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const admin = await db.get('SELECT * FROM admin_users WHERE username = ?', [username.trim()]);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign({ isAdmin: true, username: admin.username }, JWT_SECRET, {
    expiresIn: '8h',
  });

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
  });

  res.json({ success: true, username: admin.username });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.json({ authenticated: false });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ authenticated: true, username: payload.username });
  } catch {
    res.json({ authenticated: false });
  }
});

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Login required' });

  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Login required' });
  }
}

module.exports = { router, requireAuth };
