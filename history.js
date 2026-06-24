/* ============================================
   AgroSense — History Page Logic
   Fetches data from Firebase Realtime Database
   and displays charts + event tables
   ============================================ */

// ============================================
// STATE
// ============================================
let currentRange = 24; // hours
let moistureChart = null;
let tempHumidChart = null;
let currentUser = null;

// ============================================
// AUTH
// ============================================
auth.onAuthStateChanged((user) => {
  currentUser = user;
  const overlay = document.getElementById('authOverlay');
  const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
  const badge = document.getElementById('firebaseBadge');
  const badgeText = document.getElementById('firebaseStatusText');

  if (user) {
    if (overlay) overlay.classList.add('hidden');
    if (sidebarLogoutBtn) sidebarLogoutBtn.style.display = '';
    if (badge) badge.className = 'firebase-badge connected';
    if (badgeText) badgeText.textContent = 'Firebase Online';
    initHistoryPage();
  } else {
    if (overlay) overlay.classList.remove('hidden');
    if (sidebarLogoutBtn) sidebarLogoutBtn.style.display = 'none';
    if (badge) badge.className = 'firebase-badge disconnected';
    if (badgeText) badgeText.textContent = 'Firebase Offline';
  }
});

async function handleHistoryLogin() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errorEl = document.getElementById('authError');
  const btn = document.getElementById('authLoginBtn');

  if (!email || !password) {
    errorEl.textContent = 'Masukkan email dan password.';
    errorEl.style.display = '';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';
  errorEl.style.display = 'none';

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    const errors = {
      'auth/user-not-found': 'Akun tidak ditemukan.',
      'auth/wrong-password': 'Password salah.',
      'auth/invalid-email': 'Format email tidak valid.',
      'auth/invalid-credential': 'Email atau password salah.',
      'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.',
      'auth/network-request-failed': 'Gagal terhubung. Periksa koneksi internet.',
    };
    errorEl.textContent = errors[err.code] || `Error: ${err.code}`;
    errorEl.style.display = '';
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Masuk';
}

function handleHistoryLogout() {
  auth.signOut();
}

// ============================================
// INITIALIZATION
// ============================================
function initHistoryPage() {
  initHamburgerMenu();
  initCharts();
  bindRangeButtons();
  loadData(currentRange);
}

// ============================================
// HAMBURGER MENU
// ============================================
function initHamburgerMenu() {
  const btn = document.getElementById('hamburgerBtn');
  const overlay = document.getElementById('navOverlay');
  const sidebar = document.getElementById('navSidebar');
  if (!btn || !overlay || !sidebar) return;

  function toggleMenu() {
    const isOpen = sidebar.classList.contains('active');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
    btn.classList.toggle('active');
    document.body.style.overflow = isOpen ? '' : 'hidden';
  }
  function closeMenu() {
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
    btn.classList.remove('active');
    document.body.style.overflow = '';
  }
  btn.addEventListener('click', toggleMenu);
  overlay.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('active')) closeMenu();
  });
}

function bindRangeButtons() {
  const buttons = document.querySelectorAll('.range-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const hours = parseInt(btn.dataset.hours);
      currentRange = hours;

      // Update info text
      const labels = { 1: '1 jam', 6: '6 jam', 24: '24 jam', 168: '7 hari', 720: '30 hari' };
      const infoEl = document.getElementById('rangeInfo');
      if (infoEl) {
        infoEl.innerHTML = `<i class="fas fa-info-circle"></i> <span>Menampilkan data ${labels[hours] || hours + ' jam'} terakhir</span>`;
      }

      loadData(hours);
    });
  });
}

// ============================================
// LOAD DATA FROM FIREBASE
// ============================================
async function loadData(hours) {
  const loading = document.getElementById('historyLoading');
  if (loading) loading.style.display = '';

  const cutoff = Date.now() - (hours * 3600 * 1000);

  try {
    // Load sensor readings and motor events in parallel
    const [sensorData, motorData] = await Promise.all([
      loadSensorData(cutoff),
      loadMotorEvents(cutoff),
    ]);

    updateStats(sensorData, motorData);
    updateCharts(sensorData);
    updateEventsTable(motorData);
  } catch (err) {
    console.error('[History] Error loading data:', err);
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

async function loadSensorData(cutoff) {
  const snap = await db.ref(FIREBASE_CONFIG.SENSOR_PATH)
    .orderByChild('timestamp')
    .startAt(cutoff)
    .limitToLast(FIREBASE_CONFIG.MAX_CHART_POINTS)
    .once('value');

  const data = [];
  snap.forEach(child => {
    data.push(child.val());
  });
  return data;
}

async function loadMotorEvents(cutoff) {
  const snap = await db.ref(FIREBASE_CONFIG.MOTOR_PATH)
    .orderByChild('timestamp')
    .startAt(cutoff)
    .limitToLast(200)
    .once('value');

  const data = [];
  snap.forEach(child => {
    data.push(child.val());
  });
  return data;
}

// ============================================
// STATS
// ============================================
function updateStats(sensorData, motorData) {
  const totalEl = document.getElementById('statTotalReadings');
  const avgMoistureEl = document.getElementById('statAvgMoisture');
  const avgTempEl = document.getElementById('statAvgTemp');
  const eventsEl = document.getElementById('statMotorEvents');

  totalEl.textContent = sensorData.length.toLocaleString('id-ID');

  if (sensorData.length > 0) {
    const avgMoisture = sensorData.reduce((s, d) => s + (d.moisture || 0), 0) / sensorData.length;
    const avgTemp = sensorData.reduce((s, d) => s + (d.temperature || 0), 0) / sensorData.length;
    avgMoistureEl.textContent = avgMoisture.toFixed(1) + '%';
    avgTempEl.textContent = avgTemp.toFixed(1) + '°C';
  } else {
    avgMoistureEl.textContent = '--.-%';
    avgTempEl.textContent = '--.-°C';
  }

  eventsEl.textContent = motorData.length.toLocaleString('id-ID');
}

// ============================================
// CHARTS
// ============================================
function initCharts() {
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleFont: { family: "'Inter', sans-serif", size: 12 },
        bodyFont: { family: "'Inter', sans-serif", size: 11 },
        padding: 10,
        cornerRadius: 8,
        displayColors: true,
      },
    },
    scales: {
      x: {
        display: true,
        ticks: {
          maxTicksLimit: 12,
          maxRotation: 0,
          font: { size: 10, family: "'Inter', sans-serif" },
          color: '#94a3b8',
        },
        grid: { display: false },
      },
    },
    animation: { duration: 600, easing: 'easeInOutQuart' },
  };

  // ── Moisture Chart ──
  const mCtx = document.getElementById('historyMoistureChart').getContext('2d');
  const mGrad = mCtx.createLinearGradient(0, 0, 0, 300);
  mGrad.addColorStop(0, 'rgba(34, 197, 94, 0.25)');
  mGrad.addColorStop(1, 'rgba(34, 197, 94, 0.02)');

  moistureChart = new Chart(mCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Kelembaban Tanah (%)',
        data: [],
        borderColor: '#22c55e',
        backgroundColor: mGrad,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#22c55e',
        borderWidth: 2.5,
      }],
    },
    options: {
      ...commonOptions,
      plugins: { ...commonOptions.plugins, legend: { display: false } },
      scales: {
        ...commonOptions.scales,
        y: {
          min: 0, max: 100,
          ticks: {
            stepSize: 20,
            font: { size: 10, family: "'Inter', sans-serif" },
            color: '#94a3b8',
            callback: v => v + '%',
          },
          grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
        },
      },
    },
  });

  // ── Temp & Humidity Chart ──
  const thCtx = document.getElementById('historyTempHumidChart').getContext('2d');

  tempHumidChart = new Chart(thCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Suhu (°C)',
          data: [],
          borderColor: '#f59e0b',
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#f59e0b',
          borderWidth: 2.5,
          yAxisID: 'yTemp',
        },
        {
          label: 'Kelembaban Udara (%)',
          data: [],
          borderColor: '#06b6d4',
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#06b6d4',
          borderWidth: 2.5,
          yAxisID: 'yHumidity',
        },
      ],
    },
    options: {
      ...commonOptions,
      plugins: {
        ...commonOptions.plugins,
        legend: {
          display: true, position: 'top', align: 'end',
          labels: {
            usePointStyle: true, pointStyle: 'circle', padding: 16,
            font: { size: 11, family: "'Inter', sans-serif" },
            color: '#475569',
          },
        },
      },
      scales: {
        ...commonOptions.scales,
        yTemp: {
          type: 'linear', position: 'left', min: 15, max: 45,
          ticks: {
            font: { size: 10, family: "'Inter', sans-serif" },
            color: '#f59e0b', callback: v => v + '°C',
          },
          grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
        },
        yHumidity: {
          type: 'linear', position: 'right', min: 20, max: 100,
          ticks: {
            font: { size: 10, family: "'Inter', sans-serif" },
            color: '#06b6d4', callback: v => v + '%',
          },
          grid: { display: false, drawBorder: false },
        },
      },
    },
  });
}

function updateCharts(sensorData) {
  if (!sensorData.length) {
    moistureChart.data.labels = [];
    moistureChart.data.datasets[0].data = [];
    moistureChart.update();
    tempHumidChart.data.labels = [];
    tempHumidChart.data.datasets[0].data = [];
    tempHumidChart.data.datasets[1].data = [];
    tempHumidChart.update();
    return;
  }

  const labels = sensorData.map(d => formatTimestamp(d.timestamp));
  const moistures = sensorData.map(d => d.moisture);
  const temps = sensorData.map(d => d.temperature);
  const humids = sensorData.map(d => d.humidity);

  moistureChart.data.labels = labels;
  moistureChart.data.datasets[0].data = moistures;
  moistureChart.update();

  tempHumidChart.data.labels = labels;
  tempHumidChart.data.datasets[0].data = temps;
  tempHumidChart.data.datasets[1].data = humids;
  tempHumidChart.update();
}

// ============================================
// EVENTS TABLE
// ============================================
function updateEventsTable(motorData) {
  const tbody = document.getElementById('eventsTableBody');
  const noMsg = document.getElementById('noEventsMsg');

  if (!motorData.length) {
    tbody.innerHTML = '';
    if (noMsg) noMsg.style.display = '';
    return;
  }

  if (noMsg) noMsg.style.display = 'none';

  // Sort descending (newest first)
  const sorted = [...motorData].sort((a, b) => b.timestamp - a.timestamp);

  tbody.innerHTML = sorted.map(event => {
    const time = formatTimestamp(event.timestamp, true);
    const device = event.type === 'pump'
      ? '<span class="device-pump"><i class="fas fa-tint"></i> Pompa Air</span>'
      : '<span class="device-sprayer"><i class="fas fa-spray-can"></i> Sprayer</span>';
    const status = event.state === 'on'
      ? '<span class="badge-on">ON</span>'
      : '<span class="badge-off">OFF</span>';
    const sourceClass = `source-${event.source || 'manual'}`;
    const sourceLabel = { manual: 'Manual', auto: 'Otomatis', scheduled: 'Terjadwal' }[event.source] || event.source || '-';
    const source = `<span class="source-badge ${sourceClass}">${sourceLabel}</span>`;

    return `<tr><td>${time}</td><td>${device}</td><td>${status}</td><td>${source}</td></tr>`;
  }).join('');
}

// ============================================
// HELPERS
// ============================================
function formatTimestamp(ts, includeDateAlways = false) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  const time = d.toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  if (isToday && !includeDateAlways && currentRange <= 24) {
    return time;
  }

  const date = d.toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short',
  });

  if (currentRange > 24) {
    return `${date} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
  }

  return `${date} ${time}`;
}
