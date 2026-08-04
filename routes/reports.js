const express = require('express');
const ExcelJS = require('exceljs');
const { requireAuth } = require('./auth');
const { syncReportToSheet } = require('../lib/googleSheets');
const { buildReport } = require('../lib/reportBuilder');

const router = express.Router();
router.use(requireAuth);

router.get('/data', async (req, res) => {
  const { range = 'daily', from, to, userId } = req.query;
  res.json(await buildReport({ range, from, to, userId }));
});

router.get('/export', async (req, res) => {
  const { range = 'daily', from, to, userId } = req.query;
  const report = await buildReport({ range, from, to, userId });

  const workbook = new ExcelJS.Workbook();

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Employee ID', key: 'employeeId', width: 16 },
    { header: 'Total Days', key: 'totalDays', width: 12 },
    { header: 'Present', key: 'presentDays', width: 10 },
    { header: 'Late', key: 'lateDays', width: 10 },
    { header: 'Half Day', key: 'halfDays', width: 10 },
    { header: 'Holiday', key: 'holidayDays', width: 10 },
    { header: 'Paid Leave', key: 'paidLeaveDays', width: 12 },
    { header: 'Optional Leave', key: 'optionalLeaveDays', width: 14 },
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

router.post('/sync-sheets', async (req, res) => {
  const { range = 'daily', from, to, userId } = req.query;
  try {
    const report = await buildReport({ range, from, to, userId });
    const url = await syncReportToSheet(report);
    res.json({ success: true, url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
