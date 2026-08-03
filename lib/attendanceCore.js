const db = require('../db/database');

function todayParts() {
  const now = new Date();
  const date = now.toLocaleDateString('en-CA'); // YYYY-MM-DD
  const time = now.toLocaleTimeString('en-GB'); // HH:MM:SS
  return { date, time };
}

// First sighting of the day for a user checks them in; every sighting after
// that keeps replacing check_out with the latest time. One row per user/day.
function recordSighting(userId) {
  const { date, time } = todayParts();

  const existing = db
    .prepare('SELECT id FROM attendance WHERE user_id = ? AND date = ?')
    .get(userId, date);

  if (!existing) {
    db.prepare('INSERT INTO attendance (user_id, date, check_in, check_out) VALUES (?, ?, ?, NULL)').run(
      userId,
      date,
      time
    );
    return { status: 'checked_in', time };
  }

  db.prepare('UPDATE attendance SET check_out = ? WHERE id = ?').run(time, existing.id);
  return { status: 'checked_out', time };
}

module.exports = { todayParts, recordSighting };
