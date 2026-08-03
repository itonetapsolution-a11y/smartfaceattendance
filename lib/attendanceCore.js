const db = require('../db/database');

function todayParts() {
  const now = new Date();
  const date = now.toLocaleDateString('en-CA'); // YYYY-MM-DD
  const time = now.toLocaleTimeString('en-GB'); // HH:MM:SS
  return { date, time };
}

// First sighting of the day for a user checks them in; every sighting after
// that keeps replacing check_out with the latest time. One row per user/day.
async function recordSighting(userId) {
  const { date, time } = todayParts();

  const existing = await db.get('SELECT id FROM attendance WHERE user_id = ? AND date = ?', [
    userId,
    date,
  ]);

  if (!existing) {
    await db.run(
      'INSERT INTO attendance (user_id, date, check_in, check_out) VALUES (?, ?, ?, NULL)',
      [userId, date, time]
    );
    return { status: 'checked_in', time };
  }

  await db.run('UPDATE attendance SET check_out = ? WHERE id = ?', [time, existing.id]);
  return { status: 'checked_out', time };
}

module.exports = { todayParts, recordSighting };
