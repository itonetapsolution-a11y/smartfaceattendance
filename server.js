const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Face Attendance System running at http://localhost:${PORT}`);
});
