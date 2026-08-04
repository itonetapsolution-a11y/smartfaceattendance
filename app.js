const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const db = require('./db/database');
const { router: authRouter } = require('./routes/auth');
const usersRouter = require('./routes/users');
const attendanceRouter = require('./routes/attendance');
const reportsRouter = require('./routes/reports');
const studentsRouter = require('./routes/students');
const settingsRouter = require('./routes/settings');

const app = express();

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// Serverless cold starts need tables ready before the first query; cached
// after the first request per warm process (see db/database.js).
app.use(async (req, res, next) => {
  try {
    await db.ensureMigrated();
    next();
  } catch (err) {
    console.error('DB migration failed:', err);
    res.status(500).json({ error: 'Database not ready' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/students', studentsRouter);
app.use('/api/settings', settingsRouter);

module.exports = app;
