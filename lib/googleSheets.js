const { google } = require('googleapis');

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!email || !key) return null;

  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function ensureSheetExists(sheets, spreadsheetId, title) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets.some((s) => s.properties.title === title);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
  }
}

async function writeSheet(sheets, spreadsheetId, title, rows) {
  await ensureSheetExists(sheets, spreadsheetId, title);
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: title });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${title}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
}

// Pushes the same {summary, daily} shape used for the Excel export into two
// tabs ("Summary", "Daily Log") of a Google Sheet, overwriting old content.
async function syncReportToSheet(report) {
  const auth = getAuth();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  if (!auth || !spreadsheetId) {
    throw new Error(
      'Google Sheets is not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY and GOOGLE_SHEET_ID.'
    );
  }

  const sheets = google.sheets({ version: 'v4', auth });

  const summaryRows = [
    [
      'Name',
      'Employee ID',
      'Total Days',
      'Present',
      'Late',
      'Half Day',
      'Holiday',
      'Paid Leave',
      'Optional Leave',
      'Absent',
      'Attendance %',
    ],
    ...report.summary.map((r) => [
      r.name,
      r.employeeId,
      r.totalDays,
      r.presentDays,
      r.lateDays,
      r.halfDays,
      r.holidayDays,
      r.paidLeaveDays,
      r.optionalLeaveDays,
      r.absentDays,
      r.attendancePct,
    ]),
  ];

  const dailyRows = [
    ['Date', 'Name', 'Employee ID', 'Status', 'Check In', 'Check Out'],
    ...report.daily.map((r) => [r.date, r.name, r.employeeId, r.status, r.checkIn, r.checkOut]),
  ];

  await writeSheet(sheets, spreadsheetId, 'Summary', summaryRows);
  await writeSheet(sheets, spreadsheetId, 'Daily Log', dailyRows);

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

module.exports = { syncReportToSheet };
