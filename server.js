const express = require('express');
const session = require('express-session');
const path = require('path');

const { router: authRouter } = require('./routes/auth');
const usersRouter = require('./routes/users');
const attendanceRouter = require('./routes/attendance');
const reportsRouter = require('./routes/reports');
const studentsRouter = require('./routes/students');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'face-attendance-local-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000 }, // 8 hours
  })
);
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/students', studentsRouter);

app.listen(PORT, () => {
  console.log(`Face Attendance System running at http://localhost:${PORT}`);
});
