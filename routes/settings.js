const express = require('express');
const { requireAuth } = require('./auth');
const { getGeofence, setGeofence } = require('../lib/geofence');
const { getAttendanceRules, setAttendanceRules } = require('../lib/attendanceStatus');

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

module.exports = router;
