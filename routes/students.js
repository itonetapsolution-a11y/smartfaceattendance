const express = require('express');
const db = require('../db/database');
const { MATCH_THRESHOLD, euclideanDistance } = require('../lib/faceMatch');
const { todayParts, recordSighting } = require('../lib/attendanceCore');

const router = express.Router();

// Identify a student by mobile number or employee ID (never by browsing a
// list — no PII beyond their own record is ever returned).
router.post('/lookup', async (req, res) => {
  const { identifier } = req.body;
  if (!identifier || !identifier.trim()) {
    return res.status(400).json({ error: 'Enter your mobile number or employee ID' });
  }

  const id = identifier.trim();
  const user = await db.get(
    'SELECT id, name, employee_id, photo FROM users WHERE employee_id = ? OR phone = ?',
    [id, id]
  );

  if (!user) {
    return res.status(404).json({ error: 'No student found with this mobile number / employee ID' });
  }

  res.json({ id: user.id, name: user.name, employeeId: user.employee_id, photo: user.photo });
});

// 1:1 face verification: the live descriptor is only ever compared against
// the ONE user identified by lookup, never matched against everyone else.
// A mismatch means "this isn't actually you" and nothing gets recorded, so a
// student can't mark attendance for someone else's ID using their own face.
router.post('/mark', async (req, res) => {
  const { userId, descriptor } = req.body;

  if (!userId || !descriptor || !Array.isArray(descriptor)) {
    return res.status(400).json({ error: 'userId and descriptor are required' });
  }

  const user = await db.get(
    'SELECT id, name, employee_id, photo, descriptor FROM users WHERE id = ?',
    [userId]
  );
  if (!user) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const storedDescriptor = JSON.parse(user.descriptor);
  const distance = euclideanDistance(descriptor, storedDescriptor);

  if (distance > MATCH_THRESHOLD) {
    return res.json({ status: 'face_mismatch' });
  }

  const result = await recordSighting(user.id);
  res.json({
    status: result.status,
    time: result.time,
    user: { id: user.id, name: user.name, employeeId: user.employee_id, photo: user.photo },
  });
});

// Today's own check-in/check-out, for the panel to show after lookup.
router.get('/status/:userId', async (req, res) => {
  const { date } = todayParts();
  const row = await db.get(
    'SELECT check_in, check_out FROM attendance WHERE user_id = ? AND date = ?',
    [req.params.userId, date]
  );
  res.json(row || { check_in: null, check_out: null });
});

module.exports = router;
