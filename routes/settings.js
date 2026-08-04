const express = require('express');
const { requireAuth } = require('./auth');
const { getGeofence, setGeofence } = require('../lib/geofence');
const {
  getAttendanceRules,
  setAttendanceRules,
  getHolidays,
  addHoliday,
  deleteHoliday,
  getLeaves,
  addLeave,
  deleteLeave,
} = require('../lib/attendanceStatus');
const db = require('../db/database');

const router = express.Router();

router.get('/geofence', requireAuth, async (req, res) => {
  res.json(await getGeofence());
});

router.put('/geofence', requireAuth, async (req, res) => {
  const { lat, lng, radiusMeters } = req.body;
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  const parsedRadius = parseFloat(radiusMeters);

  if (
    Number.isNaN(parsedLat) ||
    Number.isNaN(parsedLng) ||
    Number.isNaN(parsedRadius) ||
    parsedRadius <= 0
  ) {
    return res.status(400).json({ error: 'lat, lng and a positive radiusMeters are required' });
  }

  await setGeofence({ lat: parsedLat, lng: parsedLng, radiusMeters: parsedRadius });
  res.json({ success: true });
});

router.get('/attendance-rules', requireAuth, async (req, res) => {
  res.json(await getAttendanceRules());
});

router.put('/attendance-rules', requireAuth, async (req, res) => {
  const { officeStartTime, lateAfterMinutes, halfDayAfterTime, minFullDayHours } = req.body;
  const timePattern = /^\d{1,2}:\d{2}$/;
  const lateMin = parseInt(lateAfterMinutes, 10);
  const minHours = parseFloat(minFullDayHours);

  if (
    !timePattern.test(officeStartTime || '') ||
    !timePattern.test(halfDayAfterTime || '') ||
    Number.isNaN(lateMin) ||
    lateMin < 0 ||
    Number.isNaN(minHours) ||
    minHours < 0
  ) {
    return res.status(400).json({ error: 'Invalid attendance rule values' });
  }

  await setAttendanceRules({
    officeStartTime,
    lateAfterMinutes: lateMin,
    halfDayAfterTime,
    minFullDayHours: minHours,
  });
  res.json({ success: true });
});

/* -------------------------------- Holidays -------------------------------- */

router.get('/holidays', requireAuth, async (req, res) => {
  res.json(await getHolidays());
});

router.post('/holidays', requireAuth, async (req, res) => {
  const { date, name } = req.body;
  if (!date || !name || !name.trim()) {
    return res.status(400).json({ error: 'date and name are required' });
  }
  try {
    await addHoliday(date, name.trim());
    res.status(201).json({ success: true });
  } catch (err) {
    if (db.isUniqueConstraintError(err)) {
      return res.status(409).json({ error: 'A holiday is already set for this date' });
    }
    res.status(500).json({ error: 'Failed to add holiday' });
  }
});

router.delete('/holidays/:id', requireAuth, async (req, res) => {
  const info = await deleteHoliday(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Holiday not found' });
  res.json({ success: true });
});

/* --------------------------------- Leaves ---------------------------------- */

router.get('/leaves', requireAuth, async (req, res) => {
  const { userId, from, to } = req.query;
  res.json(await getLeaves({ userId, from, to }));
});

router.post('/leaves', requireAuth, async (req, res) => {
  const { userId, date, type, reason } = req.body;
  if (!userId || !date || !['optional', 'paid'].includes(type)) {
    return res.status(400).json({ error: 'userId, date and a valid type (optional/paid) are required' });
  }
  const user = await db.get('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    await addLeave(userId, date, type, reason);
    res.status(201).json({ success: true });
  } catch (err) {
    if (db.isUniqueConstraintError(err)) {
      return res.status(409).json({ error: 'This user already has a leave recorded for this date' });
    }
    res.status(500).json({ error: 'Failed to grant leave' });
  }
});

router.delete('/leaves/:id', requireAuth, async (req, res) => {
  const info = await deleteLeave(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Leave record not found' });
  res.json({ success: true });
});

module.exports = router;
