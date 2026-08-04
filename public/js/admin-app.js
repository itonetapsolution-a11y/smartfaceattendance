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
let registrationInitedOnce = false;

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
    setupTabs();
    activateTab('dashboard');
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

function activateTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.style.display = p.id === `tab-${tab}` ? 'block' : 'none';
  });

  if (tab === 'registration') {
    if (!registrationInitedOnce) {
      registrationInitedOnce = true;
      initRegistration();
    }
  } else if (tab === 'users') {
    loadUsers();
  } else if (tab === 'dashboard') {
    loadDashboardData();
    loadDashboardTrend();
  } else if (tab === 'reports') {
    if (!reportsLoadedOnce) {
      reportsLoadedOnce = true;
      loadUsersDropdown();
    }
    generateReport();
  } else if (tab === 'settings') {
    loadGeofence();
    loadAttendanceRules();
    loadHolidays();
    loadLeaveUserOptions();
    loadLeaves();
  }
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
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

const regStep1 = document.getElementById('regStep1');
const regStep2 = document.getElementById('regStep2');
const stepLabel1 = document.getElementById('stepLabel1');
const stepLabel2 = document.getElementById('stepLabel2');
const nextStepBtn = document.getElementById('nextStepBtn');
const backStepBtn = document.getElementById('backStepBtn');
const step1Msg = document.getElementById('step1Msg');

function goToStep(step) {
  regStep1.style.display = step === 1 ? 'block' : 'none';
  regStep2.style.display = step === 2 ? 'block' : 'none';
  stepLabel1.style.color = step === 1 ? 'var(--text)' : 'var(--text-dim)';
  stepLabel2.style.color = step === 2 ? 'var(--text)' : 'var(--text-dim)';
}

nextStepBtn.addEventListener('click', () => {
  if (!nameInput.value.trim()) {
    step1Msg.textContent = 'Please enter a name first.';
    step1Msg.style.color = 'var(--bad)';
    return;
  }
  step1Msg.textContent = '';
  goToStep(2);
});

backStepBtn.addEventListener('click', () => goToStep(1));

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
  goToStep(1);
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
  captureMsg.textContent = 'To also update the face, capture from webcam or upload a new photo. Otherwise just click Save Changes.';
  captureMsg.style.color = 'var(--text-dim)';
  step1Msg.textContent = '';
  goToStep(1);
  activateTab('registration');
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
  step1Msg.textContent = '';
  switchToWebcamMode();
  goToStep(1);
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

document.getElementById('usersExportExcelBtn').addEventListener('click', () => {
  window.location.href = '/api/users/export/excel';
});

document.getElementById('usersExportPdfBtn').addEventListener('click', () => {
  window.location.href = '/api/users/export/pdf';
});

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
const statLate = document.getElementById('statLate');
const statHalfDay = document.getElementById('statHalfDay');
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
  statLate.textContent = stats.lateToday;
  statHalfDay.textContent = stats.halfDayToday;
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
      <td><span class="status-badge ${statusBadgeClass(row.status)}">${row.status}</span></td>
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

/* --------------------------- Dashboard chart --------------------------- */
// Present/Absent share the app's status colors (green/red). That pair fails
// the dataviz skill's CVD-separation check at the floor, so the chart never
// relies on hue alone: Absent always carries a diagonal hatch texture too,
// and the legend/tooltip spell out the label in text.

const trendChartEl = document.getElementById('trendChart');
const trendLegendEl = document.getElementById('trendLegend');
const trendEmptyEl = document.getElementById('trendEmpty');
const SVG_NS = 'http://www.w3.org/2000/svg';

async function loadDashboardTrend() {
  const res = await fetch('/api/attendance/trend?days=7');
  const data = await res.json();
  renderTrendChart(data.trend || []);
}

function svgRect(x, y, w, h) {
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', x);
  rect.setAttribute('y', y);
  rect.setAttribute('width', Math.max(w, 0));
  rect.setAttribute('height', Math.max(h, 0));
  return rect;
}

// A rect with the top two corners rounded — used for whichever stacked
// segment is the outer/terminal one, per the mark spec (baseline stays square).
function svgRoundedTopRect(x, y, w, h, r) {
  const path = document.createElementNS(SVG_NS, 'path');
  if (h <= 0 || w <= 0) {
    path.setAttribute('d', '');
    return path;
  }
  const rr = Math.min(r, w / 2, h);
  const d = `M${x},${y + h} L${x},${y + rr} A${rr},${rr} 0 0 1 ${x + rr},${y} ` +
    `L${x + w - rr},${y} A${rr},${rr} 0 0 1 ${x + w},${y + rr} L${x + w},${y + h} Z`;
  path.setAttribute('d', d);
  return path;
}

function renderTrendChart(trend) {
  trendChartEl.innerHTML = '';
  trendLegendEl.innerHTML = '';

  const hasData = trend.some((d) => d.present > 0 || d.absent > 0);
  trendEmptyEl.style.display = hasData ? 'none' : 'block';
  if (!hasData || trend.length === 0) return;

  // Legend — text-labeled, and Absent's swatch previews the same hatch used
  // in the bars so identity never depends on hue alone.
  const legendSpecs = [
    { label: 'Present', swatch: 'var(--good)' },
    {
      label: 'Absent',
      swatch:
        'repeating-linear-gradient(45deg, var(--bad) 0, var(--bad) 2px, rgba(0,0,0,0.35) 2px, rgba(0,0,0,0.35) 4px)',
    },
  ];
  for (const spec of legendSpecs) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = spec.swatch;
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(spec.label));
    trendLegendEl.appendChild(item);
  }

  const width = 640;
  const height = 240;
  const marginLeft = 32;
  const marginRight = 8;
  const marginTop = 14;
  const marginBottom = 26;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;
  const baseline = marginTop + plotHeight;

  const maxTotal = Math.max(...trend.map((d) => d.present + d.absent), 1);
  const niceMax = Math.ceil(maxTotal / 5) * 5 || 5;

  const slotWidth = plotWidth / trend.length;
  const barWidth = Math.min(24, slotWidth * 0.5);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', height);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Present and absent counts for the last 7 days');

  const defs = document.createElementNS(SVG_NS, 'defs');
  const pattern = document.createElementNS(SVG_NS, 'pattern');
  pattern.setAttribute('id', 'absentHatch');
  pattern.setAttribute('width', '6');
  pattern.setAttribute('height', '6');
  pattern.setAttribute('patternTransform', 'rotate(45)');
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  const patBg = svgRect(0, 0, 6, 6);
  patBg.setAttribute('fill', 'var(--bad)');
  const patStripe = svgRect(0, 0, 2, 6);
  patStripe.setAttribute('fill', 'rgba(0,0,0,0.35)');
  pattern.appendChild(patBg);
  pattern.appendChild(patStripe);
  defs.appendChild(pattern);
  svg.appendChild(defs);

  // Gridlines + y-axis ticks (hairline, recessive, rounded values)
  const steps = 4;
  for (let s = 0; s <= steps; s++) {
    const value = Math.round((niceMax / steps) * s);
    const y = baseline - (value / niceMax) * plotHeight;

    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', marginLeft);
    line.setAttribute('x2', width - marginRight);
    line.setAttribute('y1', y);
    line.setAttribute('y2', y);
    line.setAttribute('stroke', 'var(--border)');
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', marginLeft - 8);
    label.setAttribute('y', y + 3);
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('font-size', '10');
    label.setAttribute('fill', 'var(--text-dim)');
    label.textContent = String(value);
    svg.appendChild(label);
  }

  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  trendChartEl.appendChild(tooltip);

  function showTooltip(evt, d) {
    const dateLabel = new Date(`${d.date}T00:00:00`).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    tooltip.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'tt-title';
    title.textContent = dateLabel;
    tooltip.appendChild(title);

    [
      { label: 'Present', value: d.present, color: 'var(--good)' },
      { label: 'Absent', value: d.absent, color: 'var(--bad)' },
    ].forEach((r) => {
      const row = document.createElement('div');
      row.className = 'tt-row';
      const key = document.createElement('span');
      key.className = 'tt-key';
      key.style.background = r.color;
      const strong = document.createElement('strong');
      strong.textContent = String(r.value);
      row.appendChild(key);
      row.appendChild(strong);
      row.appendChild(document.createTextNode(` ${r.label}`));
      tooltip.appendChild(row);
    });

    const containerRect = trendChartEl.getBoundingClientRect();
    tooltip.style.left = `${evt.clientX - containerRect.left + 12}px`;
    tooltip.style.top = `${evt.clientY - containerRect.top - 44}px`;
    tooltip.classList.add('visible');
  }

  function hideTooltip() {
    tooltip.classList.remove('visible');
  }

  trend.forEach((d, i) => {
    const x = marginLeft + i * slotWidth + (slotWidth - barWidth) / 2;
    const presentH = (d.present / niceMax) * plotHeight;
    const absentH = (d.absent / niceMax) * plotHeight;
    const gap = d.present > 0 && d.absent > 0 ? 2 : 0;

    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('tabindex', '0');
    group.style.cursor = 'pointer';

    if (d.present > 0) {
      const presentTop = baseline - presentH;
      const el =
        d.absent === 0
          ? svgRoundedTopRect(x, presentTop, barWidth, presentH, 4)
          : svgRect(x, presentTop, barWidth, presentH);
      el.setAttribute('fill', 'var(--good)');
      el.classList.add('chart-bar-segment');
      group.appendChild(el);
    }

    if (d.absent > 0) {
      const trimmedH = Math.max(absentH - gap, 0);
      const absentTop = baseline - presentH - gap - trimmedH;
      const el = svgRoundedTopRect(x, absentTop, barWidth, trimmedH, 4);
      el.setAttribute('fill', 'url(#absentHatch)');
      el.classList.add('chart-bar-segment');
      group.appendChild(el);
    }

    group.addEventListener('pointermove', (e) => showTooltip(e, d));
    group.addEventListener('pointerleave', hideTooltip);
    group.addEventListener('focus', (e) => showTooltip(e, d));
    group.addEventListener('blur', hideTooltip);

    svg.appendChild(group);

    const dayLabel = new Date(`${d.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' });
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', x + barWidth / 2);
    label.setAttribute('y', height - 8);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '10');
    label.setAttribute('fill', 'var(--text-dim)');
    label.textContent = dayLabel;
    svg.appendChild(label);
  });

  trendChartEl.appendChild(svg);
}

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
      <td>${row.lateDays}</td>
      <td>${row.halfDays}</td>
      <td>${row.holidayDays}</td>
      <td>${row.paidLeaveDays}</td>
      <td>${row.optionalLeaveDays}</td>
      <td>${row.absentDays}</td>
      <td>${row.attendancePct}%</td>
    `;
    summaryBody.appendChild(tr);
  }

  dailyBody.innerHTML = '';
  dailyEmpty.style.display = report.daily.length ? 'none' : 'block';
  for (const row of report.daily) {
    dailyBody.appendChild(buildDailyRow(row));
  }
}

// HH:MM:SS (or empty) -> HH:MM for a <input type="time">
function toTimeInputValue(t) {
  return t ? t.slice(0, 5) : '';
}

function buildDailyRow(row) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${row.date}</td>
    <td>${escapeHtml(row.name)}</td>
    <td class="td-status"><span class="status-badge ${statusBadgeClass(row.status)}">${row.status}</span></td>
    <td class="td-checkin">${row.checkIn || '-'}</td>
    <td class="td-checkout">${row.checkOut || '-'}</td>
    <td class="row-actions"><button class="secondary" type="button">Edit</button></td>
  `;
  tr.querySelector('button').addEventListener('click', () => enterDailyEditMode(tr, row));
  return tr;
}

// Mirrors lib/attendanceStatus.js's computeStatus() so the badge updates live
// as the admin edits the time, before they even click Save.
let cachedAttendanceRules = null;
async function getAttendanceRulesCached() {
  if (!cachedAttendanceRules) {
    cachedAttendanceRules = await (await fetch('/api/settings/attendance-rules')).json();
  }
  return cachedAttendanceRules;
}

function timeStrToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function computeStatusClient(checkIn, checkOut, rules) {
  if (!checkIn) return 'Absent';

  const checkInMin = timeStrToMinutes(checkIn);
  const startMin = timeStrToMinutes(rules.officeStartTime);
  const lateThresholdMin = startMin + rules.lateAfterMinutes;
  const halfDayThresholdMin = timeStrToMinutes(rules.halfDayAfterTime);

  let status;
  if (checkInMin > halfDayThresholdMin) status = 'Half Day';
  else if (checkInMin > lateThresholdMin) status = 'Late';
  else status = 'Present';

  if (status !== 'Half Day' && checkOut) {
    const checkOutMin = timeStrToMinutes(checkOut);
    const workedHours = (checkOutMin - checkInMin) / 60;
    if (workedHours >= 0 && workedHours < rules.minFullDayHours) status = 'Half Day';
  }

  return status;
}

async function enterDailyEditMode(tr, row) {
  const statusCell = tr.querySelector('.td-status');
  const checkInCell = tr.querySelector('.td-checkin');
  const checkOutCell = tr.querySelector('.td-checkout');
  const actionsCell = tr.querySelector('.row-actions');

  checkInCell.innerHTML = `<input type="time" class="edit-checkin" value="${toTimeInputValue(row.checkIn)}" />`;
  checkOutCell.innerHTML = `<input type="time" class="edit-checkout" value="${toTimeInputValue(row.checkOut)}" />`;

  const deleteBtnHtml = row.id
    ? `<button class="danger" type="button" data-action="delete">Delete</button>`
    : '';
  actionsCell.innerHTML = `
    <button type="button" data-action="save">Save</button>
    ${deleteBtnHtml}
    <button class="secondary" type="button" data-action="cancel">Cancel</button>
  `;

  const checkInInput = tr.querySelector('.edit-checkin');
  const checkOutInput = tr.querySelector('.edit-checkout');
  const rules = await getAttendanceRulesCached();

  function refreshLiveStatus() {
    const live = computeStatusClient(checkInInput.value, checkOutInput.value, rules);
    statusCell.innerHTML = `<span class="status-badge ${statusBadgeClass(live)}">${live}</span>`;
  }

  checkInInput.addEventListener('input', refreshLiveStatus);
  checkOutInput.addEventListener('input', refreshLiveStatus);
  refreshLiveStatus();

  actionsCell.querySelector('[data-action="cancel"]').addEventListener('click', () => {
    dailyBody.replaceChild(buildDailyRow(row), tr);
  });

  actionsCell.querySelector('[data-action="save"]').addEventListener('click', async () => {
    const checkIn = tr.querySelector('.edit-checkin').value;
    const checkOut = tr.querySelector('.edit-checkout').value;
    if (!checkIn) {
      alert('Check-in time is required.');
      return;
    }

    const url = row.id ? `/api/attendance/${row.id}` : '/api/attendance/manual';
    const method = row.id ? 'PUT' : 'POST';
    const body = row.id
      ? { checkIn, checkOut }
      : { userId: row.userId, date: row.date, checkIn, checkOut };

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      generateReport();
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to save.');
    }
  });

  const deleteBtn = actionsCell.querySelector('[data-action="delete"]');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete this attendance record for ${row.name} on ${row.date}? This reverts it to Absent.`)) return;
      const res = await fetch(`/api/attendance/${row.id}`, { method: 'DELETE' });
      if (res.ok) {
        generateReport();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete.');
      }
    });
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

/* ------------------------------- Settings ------------------------------- */

const geoLat = document.getElementById('geoLat');
const geoLng = document.getElementById('geoLng');
const geoRadius = document.getElementById('geoRadius');
const useCurrentLocationBtn = document.getElementById('useCurrentLocationBtn');
const saveGeofenceBtn = document.getElementById('saveGeofenceBtn');
const geofenceMsg = document.getElementById('geofenceMsg');

async function loadGeofence() {
  const res = await fetch('/api/settings/geofence');
  const data = await res.json();
  geoLat.value = data.lat;
  geoLng.value = data.lng;
  geoRadius.value = data.radiusMeters;
}

useCurrentLocationBtn.addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    geofenceMsg.textContent = 'Geolocation is not supported by this browser.';
    geofenceMsg.style.color = 'var(--bad)';
    return;
  }
  useCurrentLocationBtn.disabled = true;
  geofenceMsg.textContent = 'Getting your current location...';
  geofenceMsg.style.color = 'var(--text-dim)';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      geoLat.value = pos.coords.latitude;
      geoLng.value = pos.coords.longitude;
      geofenceMsg.textContent = 'Location filled in. Click Save Settings to apply.';
      geofenceMsg.style.color = 'var(--good)';
      useCurrentLocationBtn.disabled = false;
    },
    () => {
      geofenceMsg.textContent = 'Could not get your location. Check location permission.';
      geofenceMsg.style.color = 'var(--bad)';
      useCurrentLocationBtn.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
});

saveGeofenceBtn.addEventListener('click', async () => {
  saveGeofenceBtn.disabled = true;
  geofenceMsg.textContent = 'Saving...';
  geofenceMsg.style.color = 'var(--text-dim)';

  const res = await fetch('/api/settings/geofence', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: geoLat.value, lng: geoLng.value, radiusMeters: geoRadius.value }),
  });
  const data = await res.json();

  if (res.ok) {
    geofenceMsg.textContent = 'Saved. New location applies immediately.';
    geofenceMsg.style.color = 'var(--good)';
  } else {
    geofenceMsg.textContent = data.error || 'Failed to save.';
    geofenceMsg.style.color = 'var(--bad)';
  }

  saveGeofenceBtn.disabled = false;
});

const ruleStartTime = document.getElementById('ruleStartTime');
const ruleLateAfter = document.getElementById('ruleLateAfter');
const ruleHalfDayAfter = document.getElementById('ruleHalfDayAfter');
const ruleMinHours = document.getElementById('ruleMinHours');
const saveRulesBtn = document.getElementById('saveRulesBtn');
const rulesMsg = document.getElementById('rulesMsg');

async function loadAttendanceRules() {
  const res = await fetch('/api/settings/attendance-rules');
  const data = await res.json();
  ruleStartTime.value = data.officeStartTime;
  ruleLateAfter.value = data.lateAfterMinutes;
  ruleHalfDayAfter.value = data.halfDayAfterTime;
  ruleMinHours.value = data.minFullDayHours;
}

saveRulesBtn.addEventListener('click', async () => {
  saveRulesBtn.disabled = true;
  rulesMsg.textContent = 'Saving...';
  rulesMsg.style.color = 'var(--text-dim)';

  const res = await fetch('/api/settings/attendance-rules', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      officeStartTime: ruleStartTime.value,
      lateAfterMinutes: ruleLateAfter.value,
      halfDayAfterTime: ruleHalfDayAfter.value,
      minFullDayHours: ruleMinHours.value,
    }),
  });
  const data = await res.json();

  if (res.ok) {
    rulesMsg.textContent = 'Saved. Applies immediately across Dashboard, Reports and exports.';
    rulesMsg.style.color = 'var(--good)';
  } else {
    rulesMsg.textContent = data.error || 'Failed to save.';
    rulesMsg.style.color = 'var(--bad)';
  }

  saveRulesBtn.disabled = false;
});

/* ------------------------------- Holidays ------------------------------- */

const holidayDate = document.getElementById('holidayDate');
const holidayName = document.getElementById('holidayName');
const addHolidayBtn = document.getElementById('addHolidayBtn');
const holidayMsg = document.getElementById('holidayMsg');
const holidaysBody = document.getElementById('holidaysBody');
const holidaysEmpty = document.getElementById('holidaysEmpty');

async function loadHolidays() {
  const res = await fetch('/api/settings/holidays');
  const holidays = await res.json();

  holidaysBody.innerHTML = '';
  holidaysEmpty.style.display = holidays.length ? 'none' : 'block';

  for (const h of holidays) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${h.date}</td>
      <td>${escapeHtml(h.name)}</td>
      <td class="row-actions"><button class="danger" type="button">Delete</button></td>
    `;
    tr.querySelector('button').addEventListener('click', async () => {
      if (!confirm(`Remove holiday "${h.name}" on ${h.date}?`)) return;
      await fetch(`/api/settings/holidays/${h.id}`, { method: 'DELETE' });
      loadHolidays();
    });
    holidaysBody.appendChild(tr);
  }
}

addHolidayBtn.addEventListener('click', async () => {
  if (!holidayDate.value || !holidayName.value.trim()) {
    holidayMsg.textContent = 'Pick a date and enter a name.';
    holidayMsg.style.color = 'var(--bad)';
    return;
  }

  addHolidayBtn.disabled = true;
  const res = await fetch('/api/settings/holidays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: holidayDate.value, name: holidayName.value.trim() }),
  });
  const data = await res.json();

  if (res.ok) {
    holidayMsg.textContent = 'Holiday added.';
    holidayMsg.style.color = 'var(--good)';
    holidayDate.value = '';
    holidayName.value = '';
    loadHolidays();
  } else {
    holidayMsg.textContent = data.error || 'Failed to add holiday.';
    holidayMsg.style.color = 'var(--bad)';
  }
  addHolidayBtn.disabled = false;
});

/* --------------------------------- Leaves -------------------------------- */

const leaveUser = document.getElementById('leaveUser');
const leaveDate = document.getElementById('leaveDate');
const leaveType = document.getElementById('leaveType');
const leaveReason = document.getElementById('leaveReason');
const addLeaveBtn = document.getElementById('addLeaveBtn');
const leaveMsg = document.getElementById('leaveMsg');
const leavesBody = document.getElementById('leavesBody');
const leavesEmpty = document.getElementById('leavesEmpty');

let leaveUsersLoadedOnce = false;
async function loadLeaveUserOptions() {
  if (leaveUsersLoadedOnce) return;
  leaveUsersLoadedOnce = true;
  const res = await fetch('/api/users');
  const users = await res.json();
  leaveUser.innerHTML = '';
  for (const u of users) {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    leaveUser.appendChild(opt);
  }
}

async function loadLeaves() {
  const res = await fetch('/api/settings/leaves');
  const leaves = await res.json();

  leavesBody.innerHTML = '';
  leavesEmpty.style.display = leaves.length ? 'none' : 'block';

  for (const l of leaves) {
    const tr = document.createElement('tr');
    const typeLabel = l.type === 'paid' ? 'Paid Leave' : 'Optional Leave';
    const badgeClass = l.type === 'paid' ? 'status-paid' : 'status-optional';
    tr.innerHTML = `
      <td>${l.date}</td>
      <td>${escapeHtml(l.name)}</td>
      <td><span class="status-badge ${badgeClass}">${typeLabel}</span></td>
      <td class="row-actions"><button class="danger" type="button">Delete</button></td>
    `;
    tr.querySelector('button').addEventListener('click', async () => {
      if (!confirm(`Remove this leave for ${l.name} on ${l.date}?`)) return;
      await fetch(`/api/settings/leaves/${l.id}`, { method: 'DELETE' });
      loadLeaves();
    });
    leavesBody.appendChild(tr);
  }
}

addLeaveBtn.addEventListener('click', async () => {
  if (!leaveUser.value || !leaveDate.value) {
    leaveMsg.textContent = 'Pick a user and a date.';
    leaveMsg.style.color = 'var(--bad)';
    return;
  }

  addLeaveBtn.disabled = true;
  const res = await fetch('/api/settings/leaves', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: leaveUser.value,
      date: leaveDate.value,
      type: leaveType.value,
      reason: leaveReason.value.trim(),
    }),
  });
  const data = await res.json();

  if (res.ok) {
    leaveMsg.textContent = 'Leave granted.';
    leaveMsg.style.color = 'var(--good)';
    leaveDate.value = '';
    leaveReason.value = '';
    loadLeaves();
  } else {
    leaveMsg.textContent = data.error || 'Failed to grant leave.';
    leaveMsg.style.color = 'var(--bad)';
  }
  addLeaveBtn.disabled = false;
});

/* -------------------------------- Start -------------------------------- */

checkAuth();
