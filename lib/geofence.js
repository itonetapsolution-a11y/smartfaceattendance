const db = require('../db/database');
const { distanceMeters } = require('./geo');

async function getGeofence() {
  const rows = await db.all(
    "SELECT key, value FROM settings WHERE key IN ('geofence_lat', 'geofence_lng', 'geofence_radius_m')"
  );
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    lat: parseFloat(map.geofence_lat),
    lng: parseFloat(map.geofence_lng),
    radiusMeters: parseFloat(map.geofence_radius_m),
  };
}

async function setGeofence({ lat, lng, radiusMeters }) {
  const entries = [
    ['geofence_lat', String(lat)],
    ['geofence_lng', String(lng)],
    ['geofence_radius_m', String(radiusMeters)],
  ];
  for (const [key, value] of entries) {
    await db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value]
    );
  }
}

// Checks a submitted lat/lng against the configured geofence. Returns
// { withinRange, distance } — the route decides what to do with a miss.
async function checkWithinGeofence(latitude, longitude) {
  const geofence = await getGeofence();
  const distance = distanceMeters(latitude, longitude, geofence.lat, geofence.lng);
  return { withinRange: distance <= geofence.radiusMeters, distance, geofence };
}

module.exports = { getGeofence, setGeofence, checkWithinGeofence };
