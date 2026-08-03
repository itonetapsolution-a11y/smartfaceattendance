const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('./auth');

const router = express.Router();

// List all registered users (without descriptor, keep response light)
router.get('/', requireAuth, (req, res) => {
  const users = db
    .prepare('SELECT id, name, employee_id, phone, photo, created_at FROM users ORDER BY created_at DESC')
    .all();
  res.json(users);
});

// Get all descriptors for client-side face matching
router.get('/descriptors', (req, res) => {
  const users = db.prepare('SELECT id, name, descriptor FROM users').all();
  const parsed = users.map((u) => ({
    id: u.id,
    name: u.name,
    descriptor: JSON.parse(u.descriptor),
  }));
  res.json(parsed);
});

// Register a new user with a face descriptor
router.post('/', requireAuth, (req, res) => {
  const { name, employeeId, phone, descriptor, photo } = req.body;

  if (!name || !descriptor || !Array.isArray(descriptor)) {
    return res.status(400).json({ error: 'name and descriptor are required' });
  }

  try {
    const stmt = db.prepare(
      'INSERT INTO users (name, employee_id, phone, descriptor, photo) VALUES (?, ?, ?, ?, ?)'
    );
    const info = stmt.run(
      name.trim(),
      employeeId ? employeeId.trim() : null,
      phone ? phone.trim() : null,
      JSON.stringify(descriptor),
      photo || null
    );
    res.status(201).json({ id: info.lastInsertRowid, name, employeeId });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Employee ID already exists' });
    }
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Edit an existing user. descriptor/photo are optional — sent only when the
// face was re-captured/re-uploaded during the edit; otherwise the existing
// face data is kept and only name/employeeId change.
router.put('/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { name, employeeId, phone, descriptor, photo } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const newDescriptor =
    descriptor && Array.isArray(descriptor) ? JSON.stringify(descriptor) : existing.descriptor;
  const newPhoto = descriptor && Array.isArray(descriptor) ? photo || null : existing.photo;
  const newEmployeeId = employeeId ? employeeId.trim() : null;
  const newPhone = phone ? phone.trim() : null;

  try {
    db.prepare(
      'UPDATE users SET name = ?, employee_id = ?, phone = ?, descriptor = ?, photo = ? WHERE id = ?'
    ).run(name.trim(), newEmployeeId, newPhone, newDescriptor, newPhoto, req.params.id);
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Employee ID already exists' });
    }
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete a user
router.delete('/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ success: true });
});

module.exports = router;
