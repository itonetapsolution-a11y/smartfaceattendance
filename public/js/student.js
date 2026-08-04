const lookupSection = document.getElementById('lookupSection');
const identifierInput = document.getElementById('identifierInput');
const lookupBtn = document.getElementById('lookupBtn');
const lookupError = document.getElementById('lookupError');

const panelSection = document.getElementById('panelSection');
const studentPhoto = document.getElementById('studentPhoto');
const studentPhotoPlaceholder = document.getElementById('studentPhotoPlaceholder');
const studentName = document.getElementById('studentName');
const studentId = document.getElementById('studentId');

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const recognitionStatus = document.getElementById('recognitionStatus');
const markBtn = document.getElementById('markBtn');
const switchUserBtn = document.getElementById('switchUserBtn');
const myCheckIn = document.getElementById('myCheckIn');
const myCheckOut = document.getElementById('myCheckOut');

const myRangeSelect = document.getElementById('myRangeSelect');
const myFromDate = document.getElementById('myFromDate');
const myToDate = document.getElementById('myToDate');
const myGenerateBtn = document.getElementById('myGenerateBtn');
const myDownloadExcelBtn = document.getElementById('myDownloadExcelBtn');
const myDownloadPdfBtn = document.getElementById('myDownloadPdfBtn');
const myRangeLabel = document.getElementById('myRangeLabel');
const myDailyBody = document.getElementById('myDailyBody');
const myDailyEmpty = document.getElementById('myDailyEmpty');
const mySumPresent = document.getElementById('mySumPresent');
const mySumLate = document.getElementById('mySumLate');
const mySumHalfDay = document.getElementById('mySumHalfDay');
const mySumHoliday = document.getElementById('mySumHoliday');
const mySumPaidLeave = document.getElementById('mySumPaidLeave');
const mySumOptionalLeave = document.getElementById('mySumOptionalLeave');
const mySumAbsent = document.getElementById('mySumAbsent');
const mySumPct = document.getElementById('mySumPct');

const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

let student = null;
let cameraStarted = false;
let mediaStream = null;

// Attendance can only be marked near the configured location.
let currentPosition = null;
let locationError = null;

function startLocationWatch() {
  if (!('geolocation' in navigator)) {
    locationError = 'Geolocation is not supported by this browser.';
    return;
  }
  navigator.geolocation.watchPosition(
    (pos) => {
      currentPosition = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      locationError = null;
    },
    () => {
      currentPosition = null;
      locationError = 'Location permission is required to mark attendance.';
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function todayStr() {
  return new Date().toLocaleDateString('en-CA');
}

function statusBadgeClass(status) {
  if (status === 'Present') return 'status-good';
  if (status === 'Late') return 'status-warn';
  if (status === 'Half Day') return 'status-half';
  if (status === 'Holiday') return 'status-holiday';
  if (status === 'Paid Leave') return 'status-paid';
  if (status === 'Optional Leave') return 'status-optional';
  return 'status-bad'; // Absent
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-IN';
  window.speechSynthesis.speak(utterance);
}

function setStatus(text, type) {
  recognitionStatus.textContent = text;
  recognitionStatus.style.color =
    type === 'good' ? 'var(--good)' : type === 'bad' ? 'var(--bad)' : type === 'warn' ? 'var(--warn)' : 'var(--text-dim)';
}

async function loadModels() {
  await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
  await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
  await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
}

async function startCamera() {
  mediaStream = await navigator.mediaDevices.getUserMedia({ video: {}, audio: false });
  video.srcObject = mediaStream;
  return new Promise((resolve) => {
    video.onloadedmetadata = () => resolve();
  });
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  cameraStarted = false;
}

function drawBoxLoop() {
  const displaySize = { width: overlay.clientWidth, height: overlay.clientHeight };
  faceapi.matchDimensions(overlay, displaySize);

  setInterval(async () => {
    if (!cameraStarted) return;
    const detection = await faceapi.detectSingleFace(video, detectorOptions);
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (detection) {
      const resized = faceapi.resizeResults(detection, displaySize);
      faceapi.draw.drawDetections(overlay, resized);
    }
  }, 300);
}

async function ensureCameraReady() {
  if (cameraStarted) return;
  startLocationWatch();
  await startCamera();
  await loadModels();
  cameraStarted = true;
  markBtn.disabled = false;
  setStatus('Ready. Position your face and click "Mark My Attendance".', 'dim');
  drawBoxLoop();
}

async function loadTodayStatus() {
  const res = await fetch(`/api/students/status/${student.id}`);
  const row = await res.json();
  myCheckIn.textContent = row.check_in || '-';
  myCheckOut.textContent = row.check_out || '-';
}

function updateMyRangeVisibility() {
  const isCustom = myRangeSelect.value === 'custom';
  myFromDate.style.display = isCustom ? 'inline-block' : 'none';
  myToDate.style.display = isCustom ? 'inline-block' : 'none';
}

function buildMyReportQuery() {
  const range = myRangeSelect.value;
  const params = new URLSearchParams({ range });
  if (range === 'custom') {
    params.set('from', myFromDate.value || todayStr());
    params.set('to', myToDate.value || todayStr());
  }
  return params;
}

async function loadMyReport() {
  if (!student) return;
  const params = buildMyReportQuery();
  const res = await fetch(`/api/students/report/${student.id}?${params.toString()}`);
  const report = await res.json();
  const summary = report.summary[0] || {
    presentDays: 0,
    lateDays: 0,
    halfDays: 0,
    holidayDays: 0,
    paidLeaveDays: 0,
    optionalLeaveDays: 0,
    absentDays: 0,
    attendancePct: 0,
  };

  myRangeLabel.textContent = `Showing ${report.from} to ${report.to}`;
  mySumPresent.textContent = summary.presentDays;
  mySumLate.textContent = summary.lateDays;
  mySumHalfDay.textContent = summary.halfDays;
  mySumHoliday.textContent = summary.holidayDays;
  mySumPaidLeave.textContent = summary.paidLeaveDays;
  mySumOptionalLeave.textContent = summary.optionalLeaveDays;
  mySumAbsent.textContent = summary.absentDays;
  mySumPct.textContent = `${summary.attendancePct}%`;

  myDailyBody.innerHTML = '';
  myDailyEmpty.style.display = report.daily.length ? 'none' : 'block';
  for (const row of report.daily) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.date}</td>
      <td><span class="status-badge ${statusBadgeClass(row.status)}">${escapeHtml(row.status)}</span></td>
      <td>${row.checkIn || '-'}</td>
      <td>${row.checkOut || '-'}</td>
    `;
    myDailyBody.appendChild(tr);
  }
}

myRangeSelect.addEventListener('change', () => {
  updateMyRangeVisibility();
  loadMyReport();
});
myFromDate.addEventListener('change', loadMyReport);
myToDate.addEventListener('change', loadMyReport);
myGenerateBtn.addEventListener('click', loadMyReport);

myDownloadExcelBtn.addEventListener('click', () => {
  if (!student) return;
  const params = buildMyReportQuery();
  params.set('format', 'xlsx');
  window.location.href = `/api/students/report/${student.id}/export?${params.toString()}`;
});

myDownloadPdfBtn.addEventListener('click', () => {
  if (!student) return;
  const params = buildMyReportQuery();
  params.set('format', 'pdf');
  window.location.href = `/api/students/report/${student.id}/export?${params.toString()}`;
});

myFromDate.value = todayStr();
myToDate.value = todayStr();
updateMyRangeVisibility();

lookupBtn.addEventListener('click', async () => {
  const identifier = identifierInput.value.trim();
  lookupError.textContent = '';
  if (!identifier) {
    lookupError.textContent = 'Please enter your mobile number or employee ID.';
    return;
  }

  lookupBtn.disabled = true;
  const res = await fetch('/api/students/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier }),
  });
  const data = await res.json();
  lookupBtn.disabled = false;

  if (!res.ok) {
    lookupError.textContent = data.error || 'Student not found.';
    return;
  }

  student = data;
  studentName.textContent = student.name;
  studentId.textContent = student.employeeId ? `ID: ${student.employeeId}` : '';
  if (student.photo) {
    studentPhoto.src = student.photo;
    studentPhoto.style.display = 'block';
    studentPhotoPlaceholder.style.display = 'none';
  } else {
    studentPhoto.style.display = 'none';
    studentPhotoPlaceholder.style.display = 'flex';
  }

  lookupSection.style.display = 'none';
  panelSection.style.display = 'block';

  // These don't need the camera, so they load even if it fails to start.
  loadTodayStatus();
  loadMyReport();

  try {
    await ensureCameraReady();
  } catch (err) {
    setStatus('Camera unavailable. You can still view your attendance below.', 'bad');
  }
});

identifierInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') lookupBtn.click();
});

markBtn.addEventListener('click', async () => {
  markBtn.disabled = true;
  setStatus('Detecting your face...', 'dim');

  const detection = await faceapi
    .detectSingleFace(video, detectorOptions)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    setStatus('No face detected. Make sure your face is clearly visible and try again.', 'bad');
    markBtn.disabled = false;
    return;
  }

  if (!currentPosition) {
    setStatus(locationError || 'Getting your location...', 'warn');
    markBtn.disabled = false;
    return;
  }

  const res = await fetch('/api/students/mark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: student.id,
      descriptor: Array.from(detection.descriptor),
      latitude: currentPosition.latitude,
      longitude: currentPosition.longitude,
    }),
  });
  const data = await res.json();

  if (data.status === 'checked_in') {
    setStatus(`✅ Checked in at ${data.time}.`, 'good');
    speak(`Welcome, ${student.name}. Checked in.`);
    myCheckIn.textContent = data.time;
    loadMyReport();
  } else if (data.status === 'checked_out') {
    setStatus(`ℹ️ Checked out updated at ${data.time}.`, 'warn');
    speak(`${student.name}, checked out.`);
    myCheckOut.textContent = data.time;
    loadMyReport();
  } else if (data.status === 'face_mismatch') {
    setStatus('❌ This face does not match this ID. Attendance not marked.', 'bad');
    speak('Face does not match this ID. Attendance not marked.');
  } else if (data.status === 'outside_geofence') {
    setStatus(`❌ You are ${data.distance}m away from the allowed location. Move closer to mark attendance.`, 'bad');
    speak('You are too far from the location. Attendance not marked.');
  } else {
    setStatus(data.error || 'Something went wrong.', 'bad');
  }

  markBtn.disabled = false;
});

switchUserBtn.addEventListener('click', () => {
  stopCamera();
  student = null;
  identifierInput.value = '';
  lookupError.textContent = '';
  panelSection.style.display = 'none';
  lookupSection.style.display = 'block';
  markBtn.disabled = true;
});
