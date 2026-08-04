const db = require('../db/database');

const RULE_KEYS = ['office_start_time', 'late_after_minutes', 'half_day_after_time', 'min_full_day_hours'];

async function getAttendanceRules() {
  const rows = await db.all(
    `SELECT key, value FROM settings WHERE key IN (${RULE_KEYS.map(() => '?').join(',')})`,
    RULE_KEYS
  );
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    officeStartTime: map.office_start_time || '09:00',
    lateAfterMinutes: parseInt(map.late_after_minutes, 10) || 0,
    halfDayAfterTime: map.half_day_after_time || '13:00',
    minFullDayHours: parseFloat(map.min_full_day_hours) || 0,
  };
}

async function setAttendanceRules({ officeStartTime, lateAfterMinutes, halfDayAfterTime, minFullDayHours }) {
  const entries = [
    ['office_start_time', officeStartTime],
    ['late_after_minutes', String(lateAfterMinutes)],
    ['half_day_after_time', halfDayAfterTime],
    ['min_full_day_hours', String(minFullDayHours)],
  ];
  for (const [key, value] of entries) {
    await db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value]
    );
  }
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

// Pure check-in/check-out -> Present / Late / Half Day / Absent.
function computeAttendanceStatus(row, rules) {
  if (!row || !row.check_in) return 'Absent';

  const checkInMin = timeToMinutes(row.check_in);
  const startMin = timeToMinutes(rules.officeStartTime);
  const lateThresholdMin = startMin + rules.lateAfterMinutes;
  const halfDayThresholdMin = timeToMinutes(rules.halfDayAfterTime);

  let status;
  if (checkInMin > halfDayThresholdMin) {
    status = 'Half Day';
  } else if (checkInMin > lateThresholdMin) {
    status = 'Late';
  } else {
    status = 'Present';
  }

  if (status !== 'Half Day' && row.check_out) {
    const checkOutMin = timeToMinutes(row.check_out);
    const workedHours = (checkOutMin - checkInMin) / 60;
    if (workedHours >= 0 && workedHours < rules.minFullDayHours) {
      status = 'Half Day';
    }
  }

  return status;
}

// Present / Late / Half Day / Absent / Holiday / Paid Leave / Optional Leave.
// A company holiday always wins; an approved leave wins over a plain no-show;
// otherwise it falls back to the check-in/check-out based computation.
// `override` is { isHoliday, leaveType } — both optional.
function computeStatus(row, rules, override = {}) {
  if (override.isHoliday) return 'Holiday';
  if (override.leaveType === 'paid') return 'Paid Leave';
  if (override.leaveType === 'optional') return 'Optional Leave';
  return computeAttendanceStatus(row, rules);
}

/* --------------------------------- Holidays -------------------------------- */

async function getHolidays() {
  return db.all('SELECT id, date, name FROM holidays ORDER BY date ASC');
}

async function getHolidaysInRange(from, to) {
  const rows = await db.all('SELECT date, name FROM holidays WHERE date BETWEEN ? AND ?', [from, to]);
  return new Map(rows.map((r) => [r.date, r.name]));
}

async function addHoliday(date, name) {
  await db.run('INSERT INTO holidays (date, name) VALUES (?, ?)', [date, name]);
}

async function deleteHoliday(id) {
  return db.run('DELETE FROM holidays WHERE id = ?', [id]);
}

/* ---------------------------------- Leaves ---------------------------------- */

async function getLeaves({ userId, from, to } = {}) {
  const clauses = [];
  const args = [];
  if (userId) {
    clauses.push('l.user_id = ?');
    args.push(userId);
  }
  if (from && to) {
    clauses.push('l.date BETWEEN ? AND ?');
    args.push(from, to);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.all(
    `SELECT l.id, l.user_id, u.name, u.employee_id, l.date, l.type, l.reason
     FROM leaves l JOIN users u ON u.id = l.user_id
     ${where}
     ORDER BY l.date DESC`,
    args
  );
}

async function getLeavesInRange(from, to) {
  const rows = await db.all('SELECT user_id, date, type FROM leaves WHERE date BETWEEN ? AND ?', [
    from,
    to,
  ]);
  return new Map(rows.map((r) => [`${r.user_id}_${r.date}`, r.type]));
}

async function addLeave(userId, date, type, reason) {
  await db.run('INSERT INTO leaves (user_id, date, type, reason) VALUES (?, ?, ?, ?)', [
    userId,
    date,
    type,
    reason || null,
  ]);
}

async function deleteLeave(id) {
  return db.run('DELETE FROM leaves WHERE id = ?', [id]);
}

module.exports = {
  getAttendanceRules,
  setAttendanceRules,
  computeStatus,
  getHolidays,
  getHolidaysInRange,
  addHoliday,
  deleteHoliday,
  getLeaves,
  getLeavesInRange,
  addLeave,
  deleteLeave,
};
