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

// Present / Late / Half Day / Absent, from a single attendance row (or none)
// and the admin-configured rules. Absent = no row at all for that day.
function computeStatus(row, rules) {
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

module.exports = { getAttendanceRules, setAttendanceRules, computeStatus };
