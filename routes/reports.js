const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../db/database');
const { requireAuth } = require('./auth');

const router = express.Router();
router.use(requireAuth);

function toDateStr(d) {
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD
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

// Builds the { summary, daily, from, to } report shape shared by the JSON and Excel endpoints.
function buildReport({ range, from: fromQ, to: toQ, userId }) {
  const { from, to } = resolveRange(range, fromQ, toQ);
  const dates = dateRangeList(from, to);

  const users = userId
    ? db.prepare('SELECT id, name, employee_id FROM users WHERE id = ?').all(userId)
    : db.prepare('SELECT id, name, employee_id FROM users ORDER BY name ASC').all();

  const attendanceRows = userId
    ? db
        .prepare('SELECT * FROM attendance WHERE user_id = ? AND date BETWEEN ? AND ?')
        .all(userId, from, to)
    : db.prepare('SELECT * FROM attendance WHERE date BETWEEN ? AND ?').all(from, to);

  const byUserDate = new Map();
  for (const row of attendanceRows) {
    byUserDate.set(`${row.user_id}_${row.date}`, row);
  }

  const daily = [];
  const presentCounts = new Map();

  for (const date of dates) {
    for (const u of users) {
      const row = byUserDate.get(`${u.id}_${date}`);
      const status = row ? 'Present' : 'Absent';
      if (status === 'Present') {
        presentCounts.set(u.id, (presentCounts.get(u.id) || 0) + 1);
      }
      daily.push({
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
  const summary = users.map((u) => {
    const presentDays = presentCounts.get(u.id) || 0;
    const absentDays = totalDays - presentDays;
    return {
      userId: u.id,
      name: u.name,
      employeeId: u.employee_id || '',
      totalDays,
      presentDays,
      absentDays,
      attendancePct: totalDays ? Math.round((presentDays / totalDays) * 100) : 0,
    };
  });

  return { from, to, summary, daily };
}

router.get('/data', (req, res) => {
  const { range = 'daily', from, to, userId } = req.query;
  res.json(buildReport({ range, from, to, userId }));
});

router.get('/export', async (req, res) => {
  const { range = 'daily', from, to, userId } = req.query;
  const report = buildReport({ range, from, to, userId });

  const workbook = new ExcelJS.Workbook();

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Employee ID', key: 'employeeId', width: 16 },
    { header: 'Total Days', key: 'totalDays', width: 12 },
    { header: 'Present', key: 'presentDays', width: 10 },
    { header: 'Absent', key: 'absentDays', width: 10 },
    { header: 'Attendance %', key: 'attendancePct', width: 14 },
  ];
  summarySheet.addRows(report.summary);
  summarySheet.getRow(1).font = { bold: true };

  const dailySheet = workbook.addWorksheet('Daily Log');
  dailySheet.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Employee ID', key: 'employeeId', width: 16 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Check In', key: 'checkIn', width: 12 },
    { header: 'Check Out', key: 'checkOut', width: 12 },
  ];
  dailySheet.addRows(report.daily);
  dailySheet.getRow(1).font = { bold: true };

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="attendance_report_${report.from}_to_${report.to}.xlsx"`
  );

  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
