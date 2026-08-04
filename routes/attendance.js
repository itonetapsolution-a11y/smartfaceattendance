const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('./auth');
const { MATCH_THRESHOLD, euclideanDistance } = require('../lib/faceMatch');
const { todayParts, recordSighting } = require('../lib/attendanceCore');
const { checkWithinGeofence } = require('../lib/geofence');
const { getAttendanceRules, computeStatus } = require('../lib/attendanceStatus');

const router = express.Router();

// Server-side face match + attendance marking (N:1 — the walk-up kiosk). Only
// a face whose distance to a registered descriptor is within MATCH_THRESHOLD
// ever gets an attendance row. For the 1:1 verified flow (student enters
// their ID first), see routes/students.js.
router.post('/mark', async (req, res) => {
  const { descriptor, latitude, longitude } = req.body;

  if (!descriptor || !Array.isArray(descriptor)) {
    return res.status(400).json({ error: 'descriptor is required' });
  }
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'location is required' });
  }

  const geo = await checkWithinGeofence(latitude, longitude);
  if (!geo.withinRange) {
    return res.json({ status: 'outside_geofence', distance: Math.round(geo.distance) });
  }

  const users = await db.all('SELECT id, name, employee_id, descriptor FROM users');

  let bestMatch = null;
  let bestDistance = Infinity;

  for (const u of users) {
    const stored = JSON.parse(u.descriptor);
    const distance = euclideanDistance(descriptor, stored);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = u;
    }
  }

  if (!bestMatch || bestDistance > MATCH_THRESHOLD) {
    return res.json({ status: 'unrecognized' });
  }

  const photoRow = await db.get('SELECT photo FROM users WHERE id = ?', [bestMatch.id]);
  const userInfo = {
    id: bestMatch.id,
    name: bestMatch.name,
    employeeId: bestMatch.employee_id,
    photo: photoRow.photo,
  };

  const result = await recordSighting(bestMatch.id);
  return res.json({ status: result.status, user: userInfo, time: result.time, distance: bestDistance });
});

// List attendance for a given date (defaults to today), with computed status
router.get('/', async (req, res) => {
  const date = req.query.date || todayParts().date;
  const rows = await db.all(
    `SELECT a.id, a.date, a.check_in, a.check_out, u.id as user_id, u.name, u.employee_id, u.photo
     FROM attendance a JOIN users u ON u.id = a.user_id
     WHERE a.date = ?
     ORDER BY a.check_in ASC`,
    [date]
  );
  const rules = await getAttendanceRules();
  res.json(rows.map((row) => ({ ...row, status: computeStatus(row, rules) })));
});

// Quick stats for the dashboard: Present / Late / Half Day / Absent breakdown
router.get('/stats', requireAuth, async (req, res) => {
  const date = req.query.date || todayParts().date;
  const totalRegistered = (await db.get('SELECT COUNT(*) as c FROM users')).c;
  const rows = await db.all('SELECT check_in, check_out FROM attendance WHERE date = ?', [date]);
  const rules = await getAttendanceRules();

  const counts = { Present: 0, Late: 0, 'Half Day': 0 };
  for (const row of rows) {
    const status = computeStatus(row, rules);
    if (counts[status] !== undefined) counts[status]++;
  }
  const attendedToday = rows.length;

  res.json({
    date,
    totalRegistered,
    presentToday: counts.Present,
    lateToday: counts.Late,
    halfDayToday: counts['Half Day'],
    absentToday: totalRegistered - attendedToday,
  });
});

// Present/absent count per day for the last N days, for the dashboard chart.
router.get('/trend', requireAuth, async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 31);
  const totalRegistered = (await db.get('SELECT COUNT(*) as c FROM users')).c;

  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
  }

  const placeholders = dates.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT date, COUNT(DISTINCT user_id) as present FROM attendance WHERE date IN (${placeholders}) GROUP BY date`,
    dates
  );
  const presentByDate = Object.fromEntries(rows.map((r) => [r.date, r.present]));

  const trend = dates.map((date) => {
    const present = presentByDate[date] || 0;
    return { date, present, absent: Math.max(totalRegistered - present, 0) };
  });

  res.json({ totalRegistered, trend });
});

module.exports = router;
