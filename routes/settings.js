const express = require('express');
const { requireAuth } = require('./auth');
const { getGeofence, setGeofence } = require('../lib/geofence');

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

module.exports = router;
