function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function todayStr() {
  return new Date().toLocaleDateString('en-CA');
}

/* ---------------------------- Auth / shell ---------------------------- */

const loginSection = document.getElementById('loginSection');
const appSection = document.getElementById('appSection');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const loggedInAs = document.getElementById('loggedInAs');

let appStarted = false;

async function checkAuth() {
  const res = await fetch('/api/auth/me');
  const data = await res.json();
  if (data.authenticated) {
    showApp(data.username);
  } else {
    loginSection.style.display = 'block';
    appSection.style.display = 'none';
  }
}

function showApp(username) {
  loginSection.style.display = 'none';
  appSection.style.display = 'block';
  loggedInAs.textContent = `Logged in as ${username}`;
  if (!appStarted) {
    appStarted = true;
    initRegistration();
    setupTabs();
  }
}

loginBtn.addEventListener('click', async () => {
  loginError.textContent = '';
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: loginUsername.value.trim(), password: loginPassword.value }),
  });
  const data = await res.json();
  if (res.ok) {
    loginPassword.value = '';
    showApp(data.username);
  } else {
    loginError.textContent = data.error || 'Login failed.';
  }
});

loginPassword.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.reload();
});

/* ------------------------------- Tabs ------------------------------- */

let dashboardLoadedOnce = false;
let reportsLoadedOnce = false;

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach((p) => {
        p.style.display = p.id === `tab-${tab}` ? 'block' : 'none';
      });

      if (tab === 'dashboard') {
        loadDashboardData();
      } else if (tab === 'reports') {
        if (!reportsLoadedOnce) {
          reportsLoadedOnce = true;
          loadUsersDropdown();
        }
        generateReport();
      }
    });
  });
}

/* --------------------------- Registration --------------------------- */

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const uploadPreview = document.getElementById('uploadPreview');
const photoFile = document.getElementById('photoFile');
const clearUploadBtn = document.getElementById('clearUploadBtn');
const modelStatus = document.getElementById('modelStatus');
const formTitle = document.getElementById('formTitle');
const captureBtn = document.getElementById('captureBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const captureMsg = document.getElementById('captureMsg');
const nameInput = document.getElementById('name');
const employeeIdInput = document.getElementById('employeeId');
const phoneInput = document.getElementById('phone');
const usersTableBody = document.getElementById('usersTableBody');
const usersEmpty = document.getElementById('usersEmpty');
const userCount = document.getElementById('userCount');

const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

let isUploadMode = false;
let editingUserId = null;

function snapshotFrom(el, w, h) {
  const canvas = document.createElement('canvas');
  const targetW = 200;
  const targetH = Math.round(targetW * (h / w));
  canvas.width = targetW;
  canvas.height = targetH;
  canvas.getContext('2d').drawImage(el, 0, 0, targetW, targetH);
  return canvas.toDataURL('image/jpeg', 0.75);
}

function capturePhoto() {
  return isUploadMode
    ? snapshotFrom(uploadPreview, uploadPreview.naturalWidth, uploadPreview.naturalHeight)
    : snapshotFrom(video, video.videoWidth, video.videoHeight);
}

async function loadModels() {
  await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
  await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
  await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: {}, audio: false });
  video.srcObject = stream;
  return new Promise((resolve) => {
    video.onloadedmetadata = () => resolve();
  });
}

function drawBoxLoop() {
  const displaySize = { width: overlay.clientWidth, height: overlay.clientHeight };
  faceapi.matchDimensions(overlay, displaySize);

  setInterval(async () => {
    if (isUploadMode) return;
    const detection = await faceapi.detectSingleFace(video, detectorOptions);
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (detection) {
      const resized = faceapi.resizeResults(detection, displaySize);
      faceapi.draw.drawDetections(overlay, resized);
    }
  }, 300);
}

async function initRegistration() {
  await startCamera();
  await loadModels();
  modelStatus.textContent = 'Ready. Position your face in the frame and click Capture, or upload a photo instead.';
  modelStatus.className = '';
  captureBtn.disabled = false;
  drawBoxLoop();
  loadUsers();
}

function switchToUploadMode(dataUrl) {
  return new Promise((resolve) => {
    uploadPreview.onload = () => resolve();
    uploadPreview.src = dataUrl;
    uploadPreview.style.display = 'block';
    video.style.display = 'none';
    overlay.style.display = 'none';
    clearUploadBtn.style.display = 'inline-block';
    isUploadMode = true;
  });
}

function switchToWebcamMode() {
  photoFile.value = '';
  uploadPreview.style.display = 'none';
  video.style.display = 'block';
  overlay.style.display = 'block';
  clearUploadBtn.style.display = 'none';
  isUploadMode = false;
}

photoFile.addEventListener('change', () => {
  const file = photoFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => switchToUploadMode(reader.result);
  reader.readAsDataURL(file);
});

clearUploadBtn.addEventListener('click', switchToWebcamMode);

function enterEditMode(user) {
  editingUserId = user.id;
  nameInput.value = user.name;
  employeeIdInput.value = user.employee_id || '';
  phoneInput.value = user.phone || '';
  formTitle.textContent = `Edit User: ${user.name}`;
  captureBtn.textContent = 'Save Changes';
  cancelEditBtn.style.display = 'inline-block';
  captureMsg.textContent = 'Change the name/ID and click Save. To also update the face, capture from webcam or upload a new photo first.';
  captureMsg.style.color = 'var(--text-dim)';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function exitEditMode() {
  editingUserId = null;
  nameInput.value = '';
  employeeIdInput.value = '';
  phoneInput.value = '';
  formTitle.textContent = 'Register New Face';
  captureBtn.textContent = 'Capture & Register Face';
  cancelEditBtn.style.display = 'none';
  captureMsg.textContent = '';
  switchToWebcamMode();
}

cancelEditBtn.addEventListener('click', exitEditMode);

async function loadUsers() {
  const res = await fetch('/api/users');
  const users = await res.json();
  userCount.textContent = users.length;
  usersTableBody.innerHTML = '';
  usersEmpty.style.display = users.length ? 'none' : 'block';

  for (const u of users) {
    const tr = document.createElement('tr');
    const created = new Date(u.created_at.replace(' ', 'T')).toLocaleDateString();
    const thumb = u.photo
      ? `<img src="${u.photo}" alt="${escapeHtml(u.name)}" class="thumb" />`
      : `<div class="thumb thumb-placeholder">?</div>`;
    tr.innerHTML = `
      <td>${thumb}</td>
      <td>${escapeHtml(u.name)}</td>
      <td>${escapeHtml(u.employee_id || '-')}</td>
      <td>${escapeHtml(u.phone || '-')}</td>
      <td>${created}</td>
      <td class="row-actions">
        <button class="secondary" data-edit-id="${u.id}">Edit</button>
        <button class="danger" data-id="${u.id}">Delete</button>
      </td>
    `;
    usersTableBody.appendChild(tr);

    tr.querySelector('[data-edit-id]').addEventListener('click', () => enterEditMode(u));
  }

  usersTableBody.querySelectorAll('button.danger').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this user? Their attendance history will also be deleted.')) return;
      await fetch(`/api/users/${btn.dataset.id}`, { method: 'DELETE' });
      if (String(editingUserId) === btn.dataset.id) exitEditMode();
      loadUsers();
    });
  });
}

captureBtn.addEventListener('click', async () => {
  const name = nameInput.value.trim();
  if (!name) {
    captureMsg.textContent = 'Please enter a name first.';
    captureMsg.style.color = 'var(--bad)';
    return;
  }

  captureBtn.disabled = true;
  captureMsg.textContent = 'Detecting face...';
  captureMsg.style.color = 'var(--text-dim)';

  const source = isUploadMode ? uploadPreview : video;
  const detection = await faceapi
    .detectSingleFace(source, detectorOptions)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection && !editingUserId) {
    captureMsg.textContent = 'No face detected. Make sure the face is clearly visible and try again.';
    captureMsg.style.color = 'var(--bad)';
    captureBtn.disabled = false;
    return;
  }

  const payload = {
    name,
    employeeId: employeeIdInput.value.trim(),
    phone: phoneInput.value.trim(),
  };
  if (detection) {
    payload.descriptor = Array.from(detection.descriptor);
    payload.photo = capturePhoto();
  }

  const url = editingUserId ? `/api/users/${editingUserId}` : '/api/users';
  const method = editingUserId ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (res.ok) {
    const successMsg = editingUserId ? `Updated "${name}" successfully.` : `Registered "${name}" successfully.`;
    exitEditMode();
    captureMsg.textContent = successMsg;
    captureMsg.style.color = 'var(--good)';
    loadUsers();
  } else {
    captureMsg.textContent = data.error || 'Failed to save.';
    captureMsg.style.color = 'var(--bad)';
  }

  captureBtn.disabled = false;
});

/* ------------------------------ Dashboard ------------------------------ */

const statTotal = document.getElementById('statTotal');
const statPresent = document.getElementById('statPresent');
const statAbsent = document.getElementById('statAbsent');
const datePicker = document.getElementById('datePicker');
const todayBtn = document.getElementById('todayBtn');
const logBody = document.getElementById('logBody');
const logEmpty = document.getElementById('logEmpty');

async function loadDashboardData() {
  const date = datePicker.value || todayStr();

  const [statsRes, logRes] = await Promise.all([
    fetch(`/api/attendance/stats?date=${date}`),
    fetch(`/api/attendance?date=${date}`),
  ]);
  const stats = await statsRes.json();
  const log = await logRes.json();

  statTotal.textContent = stats.totalRegistered;
  statPresent.textContent = stats.presentToday;
  statAbsent.textContent = stats.absentToday;

  logBody.innerHTML = '';
  logEmpty.style.display = log.length ? 'none' : 'block';

  for (const row of log) {
    const tr = document.createElement('tr');
    const thumb = row.photo
      ? `<img src="${row.photo}" alt="${escapeHtml(row.name)}" class="thumb" />`
      : `<div class="thumb thumb-placeholder">?</div>`;
    tr.innerHTML = `
      <td>${thumb}</td>
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(row.employee_id || '-')}</td>
      <td>${row.check_in}</td>
      <td>${row.check_out || '-'}</td>
    `;
    logBody.appendChild(tr);
  }
}

todayBtn.addEventListener('click', () => {
  datePicker.value = todayStr();
  loadDashboardData();
});
datePicker.addEventListener('change', loadDashboardData);
datePicker.value = todayStr();

/* ------------------------------- Reports ------------------------------- */

const rangeSelect = document.getElementById('rangeSelect');
const dailyDateWrap = document.getElementById('dailyDateWrap');
const dailyDate = document.getElementById('dailyDate');
const customRangeWrap = document.getElementById('customRangeWrap');
const customRangeWrapTo = document.getElementById('customRangeWrapTo');
const fromDate = document.getElementById('fromDate');
const toDate = document.getElementById('toDate');
const userSelect = document.getElementById('userSelect');
const generateBtn = document.getElementById('generateBtn');
const downloadBtn = document.getElementById('downloadBtn');
const syncSheetsBtn = document.getElementById('syncSheetsBtn');
const syncStatus = document.getElementById('syncStatus');
const reportRangeLabel = document.getElementById('reportRangeLabel');
const summaryBody = document.getElementById('summaryBody');
const summaryEmpty = document.getElementById('summaryEmpty');
const dailyBody = document.getElementById('dailyBody');
const dailyEmpty = document.getElementById('dailyEmpty');

function updateRangeVisibility() {
  const range = rangeSelect.value;
  dailyDateWrap.style.display = range === 'daily' ? 'block' : 'none';
  customRangeWrap.style.display = range === 'custom' ? 'block' : 'none';
  customRangeWrapTo.style.display = range === 'custom' ? 'block' : 'none';
}

function buildReportQuery() {
  const range = rangeSelect.value;
  const params = new URLSearchParams({ range });
  if (range === 'daily') {
    params.set('from', dailyDate.value || todayStr());
  } else if (range === 'custom') {
    params.set('from', fromDate.value || todayStr());
    params.set('to', toDate.value || todayStr());
  }
  if (userSelect.value) params.set('userId', userSelect.value);
  return params;
}

async function loadUsersDropdown() {
  const res = await fetch('/api/users');
  const users = await res.json();
  for (const u of users) {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    userSelect.appendChild(opt);
  }
}

async function generateReport() {
  const params = buildReportQuery();
  const res = await fetch(`/api/reports/data?${params.toString()}`);
  const report = await res.json();

  reportRangeLabel.textContent = `Showing ${report.from} to ${report.to}`;

  summaryBody.innerHTML = '';
  summaryEmpty.style.display = report.summary.length ? 'none' : 'block';
  for (const row of report.summary) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(row.employeeId || '-')}</td>
      <td>${row.presentDays}</td>
      <td>${row.absentDays}</td>
      <td>${row.attendancePct}%</td>
    `;
    summaryBody.appendChild(tr);
  }

  dailyBody.innerHTML = '';
  dailyEmpty.style.display = report.daily.length ? 'none' : 'block';
  for (const row of report.daily) {
    const tr = document.createElement('tr');
    const badgeClass = row.status === 'Present' ? 'status-good' : 'status-bad';
    tr.innerHTML = `
      <td>${row.date}</td>
      <td>${escapeHtml(row.name)}</td>
      <td><span class="status-badge ${badgeClass}">${row.status}</span></td>
      <td>${row.checkIn || '-'}</td>
      <td>${row.checkOut || '-'}</td>
    `;
    dailyBody.appendChild(tr);
  }
}

rangeSelect.addEventListener('change', updateRangeVisibility);
generateBtn.addEventListener('click', generateReport);
downloadBtn.addEventListener('click', () => {
  const params = buildReportQuery();
  window.location.href = `/api/reports/export?${params.toString()}`;
});

syncSheetsBtn.addEventListener('click', async () => {
  const params = buildReportQuery();
  syncSheetsBtn.disabled = true;
  syncStatus.textContent = 'Syncing to Google Sheets...';
  syncStatus.style.color = 'var(--text-dim)';

  try {
    const res = await fetch(`/api/reports/sync-sheets?${params.toString()}`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      syncStatus.innerHTML = `Synced. <a href="${data.url}" target="_blank" rel="noopener">Open Sheet</a>`;
      syncStatus.style.color = 'var(--good)';
    } else {
      syncStatus.textContent = data.error || 'Sync failed.';
      syncStatus.style.color = 'var(--bad)';
    }
  } catch (err) {
    syncStatus.textContent = 'Sync failed.';
    syncStatus.style.color = 'var(--bad)';
  }

  syncSheetsBtn.disabled = false;
});

dailyDate.value = todayStr();
toDate.value = todayStr();
fromDate.value = todayStr();
updateRangeVisibility();

/* -------------------------------- Start -------------------------------- */

checkAuth();
