/* ============================================
   AgroSense — Troubleshooting Page Logic
   MQTT live monitor + accordion + status checks
   ============================================ */

// ============================================
// HAMBURGER MENU — Shared Navigation Logic
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
    if (e.key === 'Escape' && sidebar.classList.contains('active')) {
      closeMenu();
    }
  });
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = {
    info: 'fa-info-circle',
    success: 'fa-check-circle',
    warning: 'fa-exclamation-triangle',
    danger: 'fa-times-circle',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fas ${icons[type]} toast-icon"></i>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <i class="fas fa-times"></i>
    </button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 300);
  }, duration);
}

// ============================================
// AUTH
// ============================================
function initAuth() {
  auth.onAuthStateChanged((user) => {
    const logoutBtn = document.getElementById('sidebarLogoutBtn');
    if (user) {
      if (logoutBtn) logoutBtn.style.display = '';
    } else {
      if (logoutBtn) logoutBtn.style.display = 'none';
      window.location.href = 'index.html';
    }
  });
}

function handleTsLogout() {
  auth.signOut().then(() => {
    showToast('Anda telah keluar', 'info');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 500);
  });
}

// ============================================
// ACCORDION — Toggle
// ============================================
function toggleAccordion(header) {
  const item = header.parentElement;
  const isOpen = item.classList.contains('open');

  // Close all other items
  document.querySelectorAll('.ts-accordion-item').forEach(el => {
    el.classList.remove('open');
  });

  // Toggle the clicked item
  if (!isOpen) {
    item.classList.add('open');
  }
}

// ============================================
// SYSTEM STATUS CHECKER
// ============================================
function checkFirebaseStatus() {
  const dot = document.getElementById('tsFirebaseDot');
  const status = document.getElementById('tsFirebaseStatus');

  try {
    db.ref('.info/connected').on('value', (snap) => {
      const connected = snap.val() === true;
      if (dot) dot.className = `ts-status-dot ${connected ? 'online' : 'offline'}`;
      if (status) {
        status.textContent = connected ? 'Online' : 'Offline';
        status.className = `ts-status-value ${connected ? 'val-online' : 'val-offline'}`;
      }
    });
  } catch (e) {
    if (dot) dot.className = 'ts-status-dot offline';
    if (status) { status.textContent = 'Error'; status.className = 'ts-status-value val-offline'; }
  }
}

function updateMqttStatus(connected) {
  const dot = document.getElementById('tsMqttDot');
  const status = document.getElementById('tsMqttStatus');

  if (dot) dot.className = `ts-status-dot ${connected ? 'online' : 'offline'}`;
  if (status) {
    status.textContent = connected ? 'Terhubung' : 'Terputus';
    status.className = `ts-status-value ${connected ? 'val-online' : 'val-offline'}`;
  }
}

function updateEsp32Status(online) {
  const dot = document.getElementById('tsEsp32Dot');
  const status = document.getElementById('tsEsp32Status');

  if (dot) dot.className = `ts-status-dot ${online ? 'online' : 'offline'}`;
  if (status) {
    status.textContent = online ? 'Online' : 'Offline';
    status.className = `ts-status-value ${online ? 'val-online' : 'val-offline'}`;
  }
}

function updateSensorStatus(receiving) {
  const dot = document.getElementById('tsSensorDot');
  const status = document.getElementById('tsSensorStatus');

  if (dot) dot.className = `ts-status-dot ${receiving ? 'online' : 'unknown'}`;
  if (status) {
    status.textContent = receiving ? 'Menerima Data' : 'Menunggu...';
    status.className = `ts-status-value ${receiving ? 'val-online' : 'val-unknown'}`;
  }
}

// ============================================
// MQTT LIVE MONITOR
// ============================================
class MQTTMonitor {
  constructor() {
    this.client = null;
    this.connected = false;
    this.logEntries = [];
    this.maxEntries = 200;
    this.sensorReceived = false;
  }

  connect() {
    const host = localStorage.getItem('mqtt_host');
    const port = localStorage.getItem('mqtt_port') || '8884';
    const username = localStorage.getItem('mqtt_username');
    const password = localStorage.getItem('mqtt_password');

    if (!host) {
      showToast('Konfigurasi MQTT belum tersimpan. Atur di halaman Pengaturan terlebih dahulu.', 'warning', 5000);
      return;
    }

    const brokerUrl = `wss://${host}:${port}/mqtt`;
    const clientId = 'agrosense-monitor-' + Math.random().toString(16).slice(2, 6);

    // Disconnect existing
    if (this.client) {
      try { this.client.end(true); } catch (e) { }
      this.client = null;
    }

    const options = {
      clientId,
      keepalive: 60,
      reconnectPeriod: 0,  // Don't auto-reconnect in monitor mode
      connectTimeout: 10000,
      clean: true,
    };

    if (username) options.username = username;
    if (password) options.password = password;

    showToast('Menghubungkan ke MQTT monitor...', 'info');
    this.client = mqtt.connect(brokerUrl, options);

    this.client.on('connect', () => {
      this.connected = true;
      this._updateMonitorUI(true);
      updateMqttStatus(true);
      showToast('✅ Monitor MQTT aktif', 'success');

      // Subscribe to all agrosense topics
      this.client.subscribe('agrosense/#');

      this._addLogEntry('SYSTEM', 'Monitor terhubung — mendengarkan semua topic agrosense/#');
    });

    this.client.on('message', (topic, payload) => {
      const msg = payload.toString();
      this._addLogEntry(topic, msg);

      // Update system status based on messages
      if (topic === 'agrosense/system/status') {
        updateEsp32Status(msg === 'online');
      }
      if (topic === 'agrosense/sensor/data') {
        if (!this.sensorReceived) {
          this.sensorReceived = true;
          updateSensorStatus(true);
        }
      }
    });

    this.client.on('error', (err) => {
      this.connected = false;
      this._updateMonitorUI(false);
      updateMqttStatus(false);
      showToast(`❌ Monitor error: ${err.message}`, 'danger');
      this._addLogEntry('ERROR', err.message);
    });

    this.client.on('close', () => {
      if (this.connected) {
        this._addLogEntry('SYSTEM', 'Koneksi monitor terputus');
      }
      this.connected = false;
      this._updateMonitorUI(false);
      updateMqttStatus(false);
    });
  }

  disconnect() {
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
    this.connected = false;
    this._updateMonitorUI(false);
    updateMqttStatus(false);
    this._addLogEntry('SYSTEM', 'Monitor dihentikan');
    showToast('Monitor dihentikan', 'info');
  }

  clearLog() {
    this.logEntries = [];
    this._renderLog();
  }

  _addLogEntry(topic, payload) {
    const now = new Date();
    const time = now.toLocaleTimeString('id-ID', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    this.logEntries.unshift({ time, topic, payload });

    if (this.logEntries.length > this.maxEntries) {
      this.logEntries.pop();
    }

    this._renderLog();
  }

  _renderLog() {
    const container = document.getElementById('mqttLogContainer');
    const empty = document.getElementById('mqttLogEmpty');

    if (this.logEntries.length === 0) {
      if (empty) empty.style.display = '';
      container.innerHTML = '';
      container.appendChild(empty);
      return;
    }

    if (empty) empty.style.display = 'none';

    container.innerHTML = this.logEntries.map(entry => `
      <div class="mqtt-log-entry">
        <span class="mqtt-log-time">${entry.time}</span>
        <span class="mqtt-log-topic" title="${entry.topic}">${entry.topic}</span>
        <span class="mqtt-log-payload">${this._formatPayload(entry.payload)}</span>
      </div>
    `).join('');
  }

  _formatPayload(payload) {
    try {
      const obj = JSON.parse(payload);
      return JSON.stringify(obj);
    } catch (e) {
      return payload;
    }
  }

  _updateMonitorUI(active) {
    const dot = document.getElementById('monitorDot');
    const connectBtn = document.getElementById('monitorConnectBtn');
    const stopBtn = document.getElementById('monitorStopBtn');

    if (dot) dot.className = `monitor-dot ${active ? 'recording' : ''}`;
    if (connectBtn) connectBtn.style.display = active ? 'none' : '';
    if (stopBtn) stopBtn.style.display = active ? '' : 'none';
  }
}

// ============================================
// INITIALIZATION
// ============================================
let tsMonitor;

document.addEventListener('DOMContentLoaded', () => {
  initHamburgerMenu();
  initAuth();
  checkFirebaseStatus();

  tsMonitor = new MQTTMonitor();
});
