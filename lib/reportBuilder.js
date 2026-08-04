const db = require('../db/database');
const { getAttendanceRules, computeStatus, getHolidaysInRange, getLeavesInRange } = require('./attendanceStatus');

// Fixed to IST regardless of the server's own timezone (e.g. Vercel runs in UTC).
const TIMEZONE = 'Asia/Kolkata';

function toDateStr(d) {
  return d.toLocaleDateString('en-CA', { timeZone: TIMEZONE }); // YYYY-MM-DD
}

// Turns a range preset (or explicit from/to for "custom") into a concrete date span.
function resolveRange(range, fromQ, toQ) {
  const today = new Date();

  if (range === 'custom' && fromQ && toQ) {
    return { from: fromQ, to: toQ };
  }
  if (range === 'weekly') {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { from: toDateStr(start), to: toDateStr(today) };
  }
  if (range === 'monthly') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toDateStr(start), to: toDateStr(today) };
  }
  // 'daily' or unrecognized: a single day
  const d = fromQ || toDateStr(today);
  return { from: d, to: d };
}

function dateRangeList(from, to) {
  const dates = [];
  const cur = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cur <= end) {
    dates.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// Builds the { summary, daily, from, to } report shape shared by the admin
// Reports tab and each student's own read-only attendance view.
async function buildReport({ range, from: fromQ, to: toQ, userId }) {
  const { from, to } = resolveRange(range, fromQ, toQ);
  const dates = dateRangeList(from, to);

  const users = userId
    ? await db.all('SELECT id, name, employee_id FROM users WHERE id = ?', [userId])
    : await db.all('SELECT id, name, employee_id FROM users ORDER BY name ASC');

  const attendanceRows = userId
    ? await db.all('SELECT * FROM attendance WHERE user_id = ? AND date BETWEEN ? AND ?', [
        userId,
        from,
        to,
      ])
    : await db.all('SELECT * FROM attendance WHERE date BETWEEN ? AND ?', [from, to]);

  const byUserDate = new Map();
  for (const row of attendanceRows) {
    byUserDate.set(`${row.user_id}_${row.date}`, row);
  }

  const rules = await getAttendanceRules();
  const holidays = await getHolidaysInRange(from, to);
  const leaves = await getLeavesInRange(from, to);

  const daily = [];
  const emptyCounts = () => ({
    Present: 0,
    Late: 0,
    'Half Day': 0,
    Holiday: 0,
    'Paid Leave': 0,
    'Optional Leave': 0,
  });
  const statusCounts = new Map(); // userId -> counts

  for (const date of dates) {
    const isHoliday = holidays.has(date);
    for (const u of users) {
      const row = byUserDate.get(`${u.id}_${date}`);
      const status = computeStatus(row, rules, {
        isHoliday,
        leaveType: leaves.get(`${u.id}_${date}`),
      });
      if (status !== 'Absent') {
        const counts = statusCounts.get(u.id) || emptyCounts();
        counts[status]++;
        statusCounts.set(u.id, counts);
      }
      daily.push({
        id: row ? row.id : null,
        date,
        userId: u.id,
        name: u.name,
        employeeId: u.employee_id || '',
        status,
        checkIn: row ? row.check_in : '',
        checkOut: row && row.check_out ? row.check_out : '',
      });
    }
  }

  const totalDays = dates.length;
  const holidayDays = dates.filter((d) => holidays.has(d)).length;
  const workingDays = totalDays - holidayDays;

  const summary = users.map((u) => {
    const counts = statusCounts.get(u.id) || emptyCounts();
    // Excludes Holiday on purpose — holidays aren't working days, so they're
    // removed from the denominator (workingDays) instead of counted here.
    const accountedDays =
      counts.Present + counts.Late + counts['Half Day'] + counts['Paid Leave'] + counts['Optional Leave'];
    const absentDays = workingDays - accountedDays;
    return {
      userId: u.id,
      name: u.name,
      employeeId: u.employee_id || '',
      totalDays,
      presentDays: counts.Present,
      lateDays: counts.Late,
      halfDays: counts['Half Day'],
      holidayDays: counts.Holiday,
      paidLeaveDays: counts['Paid Leave'],
      optionalLeaveDays: counts['Optional Leave'],
      absentDays: Math.max(absentDays, 0),
      attendancePct: workingDays ? Math.round((accountedDays / workingDays) * 100) : 0,
    };
  });

  return { from, to, summary, daily };
}

module.exports = { buildReport, resolveRange, dateRangeList, toDateStr };
