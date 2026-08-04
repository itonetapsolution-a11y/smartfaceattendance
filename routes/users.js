const express = require('express');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const db = require('../db/database');
const { requireAuth } = require('./auth');

const router = express.Router();

// List all registered users (without descriptor, keep response light)
router.get('/', requireAuth, async (req, res) => {
  const users = await db.all(
    'SELECT id, name, employee_id, phone, photo, created_at FROM users ORDER BY created_at DESC'
  );
  res.json(users);
});

// Get all descriptors for client-side face matching
router.get('/descriptors', async (req, res) => {
  const users = await db.all('SELECT id, name, descriptor FROM users');
  const parsed = users.map((u) => ({
    id: u.id,
    name: u.name,
    descriptor: JSON.parse(u.descriptor),
  }));
  res.json(parsed);
});

// Export the registered users list as Excel
router.get('/export/excel', requireAuth, async (req, res) => {
  const users = await db.all(
    'SELECT name, employee_id, phone, created_at FROM users ORDER BY name ASC'
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Registered Users');
  sheet.columns = [
    { header: 'Name', key: 'name', width: 26 },
    { header: 'Employee ID', key: 'employeeId', width: 16 },
    { header: 'Mobile', key: 'phone', width: 16 },
    { header: 'Registered On', key: 'createdAt', width: 20 },
  ];
  sheet.addRows(
    users.map((u) => ({
      name: u.name,
      employeeId: u.employee_id || '',
      phone: u.phone || '',
      createdAt: u.created_at,
    }))
  );
  sheet.getRow(1).font = { bold: true };

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="registered_users.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

// Export the registered users list as PDF
router.get('/export/pdf', requireAuth, async (req, res) => {
  const users = await db.all(
    'SELECT name, employee_id, phone, created_at FROM users ORDER BY name ASC'
  );

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="registered_users.pdf"');

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);

  const columns = [
    { label: 'Name', width: 170 },
    { label: 'Employee ID', width: 110 },
    { label: 'Mobile', width: 110 },
    { label: 'Registered On', width: 120 },
  ];
  const startX = doc.page.margins.left;
  const pageBottom = doc.page.height - doc.page.margins.bottom;

  function drawHeader(y) {
    doc.font('Helvetica-Bold').fontSize(10);
    let x = startX;
    for (const col of columns) {
      doc.text(col.label, x, y, { width: col.width });
      x += col.width;
    }
    doc.moveTo(startX, y + 16).lineTo(startX + 510, y + 16).stroke();
    return y + 24;
  }

  doc.font('Helvetica-Bold').fontSize(16).text('Registered Users', startX, doc.y);
  doc.moveDown(0.5);
  let y = drawHeader(doc.y);

  doc.font('Helvetica').fontSize(10);
  for (const u of users) {
    if (y > pageBottom - 20) {
      doc.addPage();
      y = drawHeader(doc.page.margins.top);
      doc.font('Helvetica').fontSize(10);
    }
    let x = startX;
    const row = [u.name, u.employee_id || '-', u.phone || '-', u.created_at];
    row.forEach((val, i) => {
      doc.text(String(val), x, y, { width: columns[i].width });
      x += columns[i].width;
    });
    y += 20;
  }

  doc.end();
});

// Register a new user with a face descriptor
router.post('/', requireAuth, async (req, res) => {
  const { name, employeeId, phone, descriptor, photo } = req.body;

  if (!name || !descriptor || !Array.isArray(descriptor)) {
    return res.status(400).json({ error: 'name and descriptor are required' });
  }

  try {
    const info = await db.run(
      'INSERT INTO users (name, employee_id, phone, descriptor, photo) VALUES (?, ?, ?, ?, ?)',
      [
        name.trim(),
        employeeId ? employeeId.trim() : null,
        phone ? phone.trim() : null,
        JSON.stringify(descriptor),
        photo || null,
      ]
    );
    res.status(201).json({ id: info.lastInsertRowid, name, employeeId });
  } catch (err) {
    if (db.isUniqueConstraintError(err)) {
      return res.status(409).json({ error: 'Employee ID already exists' });
    }
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Edit an existing user. descriptor/photo are optional — sent only when the
// face was re-captured/re-uploaded during the edit; otherwise the existing
// face data is kept and only name/employeeId change.
router.put('/:id', requireAuth, async (req, res) => {
  const existing = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { name, employeeId, phone, descriptor, photo } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const newDescriptor =
    descriptor && Array.isArray(descriptor) ? JSON.stringify(descriptor) : existing.descriptor;
  const newPhoto = descriptor && Array.isArray(descriptor) ? photo || null : existing.photo;
  const newEmployeeId = employeeId ? employeeId.trim() : null;
  const newPhone = phone ? phone.trim() : null;

  try {
    await db.run(
      'UPDATE users SET name = ?, employee_id = ?, phone = ?, descriptor = ?, photo = ? WHERE id = ?',
      [name.trim(), newEmployeeId, newPhone, newDescriptor, newPhoto, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    if (db.isUniqueConstraintError(err)) {
      return res.status(409).json({ error: 'Employee ID already exists' });
    }
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete a user
router.delete('/:id', requireAuth, async (req, res) => {
  const info = await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ success: true });
});

module.exports = router;
