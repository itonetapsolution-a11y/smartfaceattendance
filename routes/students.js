const express = require('express');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const db = require('../db/database');
const { MATCH_THRESHOLD, euclideanDistance } = require('../lib/faceMatch');
const { todayParts, recordSighting } = require('../lib/attendanceCore');
const { checkWithinGeofence } = require('../lib/geofence');
const { buildReport } = require('../lib/reportBuilder');

const router = express.Router();

// Identify a student by mobile number or employee ID (never by browsing a
// list — no PII beyond their own record is ever returned).
router.post('/lookup', async (req, res) => {
  const { identifier } = req.body;
  if (!identifier || !identifier.trim()) {
    return res.status(400).json({ error: 'Enter your mobile number or employee ID' });
  }

  const id = identifier.trim();
  const user = await db.get(
    'SELECT id, name, employee_id, photo FROM users WHERE employee_id = ? OR phone = ?',
    [id, id]
  );

  if (!user) {
    return res.status(404).json({ error: 'No student found with this mobile number / employee ID' });
  }

  res.json({ id: user.id, name: user.name, employeeId: user.employee_id, photo: user.photo });
});

// 1:1 face verification: the live descriptor is only ever compared against
// the ONE user identified by lookup, never matched against everyone else.
// A mismatch means "this isn't actually you" and nothing gets recorded, so a
// student can't mark attendance for someone else's ID using their own face.
router.post('/mark', async (req, res) => {
  const { userId, descriptor, latitude, longitude } = req.body;

  if (!userId || !descriptor || !Array.isArray(descriptor)) {
    return res.status(400).json({ error: 'userId and descriptor are required' });
  }
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'location is required' });
  }

  const geo = await checkWithinGeofence(latitude, longitude);
  if (!geo.withinRange) {
    return res.json({ status: 'outside_geofence', distance: Math.round(geo.distance) });
  }

  const user = await db.get(
    'SELECT id, name, employee_id, photo, descriptor FROM users WHERE id = ?',
    [userId]
  );
  if (!user) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const storedDescriptor = JSON.parse(user.descriptor);
  const distance = euclideanDistance(descriptor, storedDescriptor);

  if (distance > MATCH_THRESHOLD) {
    return res.json({ status: 'face_mismatch' });
  }

  const result = await recordSighting(user.id);
  res.json({
    status: result.status,
    time: result.time,
    user: { id: user.id, name: user.name, employeeId: user.employee_id, photo: user.photo },
  });
});

// Today's own check-in/check-out, for the panel to show after lookup.
router.get('/status/:userId', async (req, res) => {
  const { date } = todayParts();
  const row = await db.get(
    'SELECT check_in, check_out FROM attendance WHERE user_id = ? AND date = ?',
    [req.params.userId, date]
  );
  res.json(row || { check_in: null, check_out: null });
});

// A student's own read-only attendance report (daily/weekly/monthly/custom).
// Same shape as the admin report but pinned to one userId — a student can
// only ever see their own record, and there's no edit endpoint exposed here.
router.get('/report/:userId', async (req, res) => {
  const { range = 'weekly', from, to } = req.query;
  const report = await buildReport({ range, from, to, userId: req.params.userId });
  res.json(report);
});

router.get('/report/:userId/export', async (req, res) => {
  const { range = 'weekly', from, to, format = 'xlsx' } = req.query;
  const report = await buildReport({ range, from, to, userId: req.params.userId });
  const studentName = report.summary[0] ? report.summary[0].name : 'Student';

  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="my_attendance_${report.from}_to_${report.to}.pdf"`
    );

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    doc.font('Helvetica-Bold').fontSize(16).text(`Attendance Report — ${studentName}`);
    doc.font('Helvetica').fontSize(10).fillColor('#555').text(`${report.from} to ${report.to}`);
    doc.moveDown(1);

    const columns = [
      { label: 'Date', width: 90 },
      { label: 'Status', width: 110 },
      { label: 'Check In', width: 110 },
      { label: 'Check Out', width: 110 },
    ];
    const startX = doc.page.margins.left;
    const pageBottom = doc.page.height - doc.page.margins.bottom;

    function drawHeader(y) {
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(10);
      let x = startX;
      for (const col of columns) {
        doc.text(col.label, x, y, { width: col.width });
        x += col.width;
      }
      doc.moveTo(startX, y + 16).lineTo(startX + 420, y + 16).stroke();
      return y + 24;
    }

    let y = drawHeader(doc.y);
    doc.font('Helvetica').fontSize(10);

    for (const row of report.daily) {
      if (y > pageBottom - 20) {
        doc.addPage();
        y = drawHeader(doc.page.margins.top);
        doc.font('Helvetica').fontSize(10);
      }
      let x = startX;
      const values = [row.date, row.status, row.checkIn || '-', row.checkOut || '-'];
      values.forEach((val, i) => {
        doc.text(String(val), x, y, { width: columns[i].width });
        x += columns[i].width;
      });
      y += 20;
    }

    doc.end();
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('My Attendance');
  sheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Check In', key: 'checkIn', width: 14 },
    { header: 'Check Out', key: 'checkOut', width: 14 },
  ];
  sheet.addRows(
    report.daily.map((r) => ({ date: r.date, status: r.status, checkIn: r.checkIn, checkOut: r.checkOut }))
  );
  sheet.getRow(1).font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="my_attendance_${report.from}_to_${report.to}.xlsx"`
  );
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
