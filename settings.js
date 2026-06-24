/* ============================================
   AgroSense — Settings Page Logic
   Standalone MQTT client for settings page
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

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('active')) {
      closeMenu();
    }
  });
}

// ============================================
// TOAST NOTIFICATIONS (lightweight)
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
// AUTH — Firebase Authentication
// ============================================
function initAuth() {
  auth.onAuthStateChanged((user) => {
    const logoutBtn = document.getElementById('sidebarLogoutBtn');
    if (user) {
      if (logoutBtn) logoutBtn.style.display = '';
    } else {
      if (logoutBtn) logoutBtn.style.display = 'none';
      // Redirect to dashboard for login
      window.location.href = 'index.html';
    }
  });
}

function handleSettingsLogout() {
  auth.signOut().then(() => {
    showToast('Anda telah keluar', 'info');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 500);
  });
}

// ============================================
// SETTINGS MQTT CLIENT
// ============================================
class SettingsMQTTClient {
  constructor() {
    this.client = null;
    this.state = 'disconnected';
  }

  connect() {
    const host = document.getElementById('mqttHost').value.trim();
    const port = document.getElementById('mqttPort').value.trim() || '8884';
    const clientId = document.getElementById('mqttClientId').value.trim() || 'agrosense-dashboard';
    const username = document.getElementById('mqttUsername').value.trim();
    const password = document.getElementById('mqttPassword').value.trim();

    if (!host) {
      showToast('Masukkan Broker Host', 'warning');
      return;
    }

    const brokerUrl = `wss://${host}:${port}/mqtt`;

    // Save to localStorage
    localStorage.setItem('mqtt_host', host);
    localStorage.setItem('mqtt_port', port);
    localStorage.setItem('mqtt_username', username);
    localStorage.setItem('mqtt_password', password);
    localStorage.setItem('mqtt_clientId', clientId);

    this._setState('connecting');

    // Disconnect existing
    if (this.client) {
      try { this.client.end(true); } catch (e) { }
      this.client = null;
    }

    const uniqueClientId = clientId + '-' + Math.random().toString(16).slice(2, 6);

    const options = {
      clientId: uniqueClientId,
      keepalive: 60,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      clean: true,
    };

    if (username) options.username = username;
    if (password) options.password = password;

    this.client = mqtt.connect(brokerUrl, options);

    this.client.on('connect', () => {
      this._setState('connected');
      showToast('✅ MQTT terhubung ke broker!', 'success');
      this._updateInfo(host, port, uniqueClientId);
    });

    this.client.on('error', (err) => {
      console.error('[MQTT] Error:', err);
      this._setState('disconnected');
      let errMsg = err.message || 'Unknown error';
      if (errMsg.includes('Not authorized') || errMsg.includes('unauthorized')) {
        errMsg = 'Autentikasi gagal — periksa username/password';
      } else if (errMsg.includes('ECONNREFUSED') || errMsg.includes('refused')) {
        errMsg = 'Koneksi ditolak — periksa host dan port';
      }
      showToast(`❌ MQTT Error: ${errMsg}`, 'danger', 6000);
    });

    this.client.on('reconnect', () => {
      this._setState('connecting');
    });

    this.client.on('close', () => {
      if (this.state === 'connected') {
        showToast('⚠️ Koneksi MQTT terputus', 'warning');
      }
      this._setState('disconnected');
    });

    this.client.on('offline', () => {
      this._setState('disconnected');
    });
  }

  disconnect() {
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
    this._setState('disconnected');
    showToast('MQTT diputuskan', 'info');
  }

  testConnection() {
    if (this.state === 'connected') {
      showToast('✅ Koneksi aktif dan berjalan!', 'success');
    } else {
      showToast('Mencoba koneksi...', 'info');
      this.connect();
    }
  }

  clearSaved() {
    localStorage.removeItem('mqtt_host');
    localStorage.removeItem('mqtt_port');
    localStorage.removeItem('mqtt_username');
    localStorage.removeItem('mqtt_password');
    localStorage.removeItem('mqtt_clientId');
    showToast('Konfigurasi tersimpan dihapus', 'info');

    document.getElementById('infoSaved').textContent = 'Tidak';

    // Reset form to defaults
    document.getElementById('mqttHost').value = '617ddeac74124ae2ac195ed4ad8f7c08.s1.eu.hivemq.cloud';
    document.getElementById('mqttPort').value = '8884';
    document.getElementById('mqttUsername').value = 'capstone-smartgreen';
    document.getElementById('mqttPassword').value = 'Capstone3';
    document.getElementById('mqttClientId').value = 'agrosense-dashboard';
  }

  _setState(state) {
    this.state = state;
    this._updateStatusUI(state);
  }

  _updateStatusUI(state) {
    const panel = document.getElementById('settingsMqttStatus');
    const dot = document.getElementById('settingsStatusDot');
    const title = document.getElementById('settingsStatusTitle');
    const desc = document.getElementById('settingsStatusDesc');
    const badge = document.getElementById('settingsStatusBadge');
    const connectBtn = document.getElementById('settingsConnectBtn');
    const disconnBtn = document.getElementById('settingsDisconnectBtn');
    const inputs = document.querySelectorAll('#mqttConfigForm input');

    const connBadge = document.getElementById('connectionBadge');
    const connDot = document.getElementById('connDot');
    const connText = document.getElementById('connText');

    const cfg = {
      connected: {
        panelCls: 'status-connected', dotCls: 'dot-connected',
        title: 'MQTT Terhubung', desc: 'Koneksi aktif ke broker MQTT',
        badge: 'Terhubung', badgeCls: 'badge-connected',
        headerBg: 'badge-online', headerDot: '', headerText: 'Online',
      },
      disconnected: {
        panelCls: 'status-disconnected', dotCls: 'dot-disconnected',
        title: 'MQTT Terputus', desc: 'Belum terhubung ke broker MQTT',
        badge: 'Terputus', badgeCls: 'badge-disconnected',
        headerBg: 'badge-offline', headerDot: 'dot-offline', headerText: 'Offline',
      },
      connecting: {
        panelCls: 'status-connecting', dotCls: 'dot-connecting',
        title: 'Menghubungkan...', desc: 'Sedang mencoba terhubung ke broker MQTT',
        badge: 'Menghubungkan...', badgeCls: 'badge-connecting',
        headerBg: '', headerDot: 'dot-connecting', headerText: 'Connecting...',
      },
    }[state];

    if (panel) panel.className = `mqtt-status-panel ${cfg.panelCls}`;
    if (dot) dot.className = `mqtt-status-dot ${cfg.dotCls}`;
    if (title) title.textContent = cfg.title;
    if (desc) desc.textContent = cfg.desc;
    if (badge) { badge.textContent = cfg.badge; badge.className = `mqtt-status-badge ${cfg.badgeCls}`; }

    // Header badge
    if (connBadge) connBadge.className = `connection-badge ${cfg.headerBg}`;
    if (connDot) connDot.className = `pulse-dot ${cfg.headerDot}`;
    if (connText) connText.textContent = cfg.headerText;

    const isConnected = state === 'connected';
    if (connectBtn) connectBtn.style.display = isConnected ? 'none' : '';
    if (disconnBtn) disconnBtn.style.display = isConnected ? '' : 'none';
    if (inputs) inputs.forEach(inp => inp.disabled = isConnected || state === 'connecting');

    // Update info panel
    document.getElementById('infoStatus').textContent = cfg.badge;
  }

  _updateInfo(host, port, clientId) {
    document.getElementById('infoBroker').textContent = `${host}:${port}`;
    document.getElementById('infoClientId').textContent = clientId;
    document.getElementById('infoSaved').textContent = 'Ya';
  }
}

// ============================================
// INITIALIZATION
// ============================================
let settingsMqtt;

document.addEventListener('DOMContentLoaded', () => {
  initHamburgerMenu();
  initAuth();

  settingsMqtt = new SettingsMQTTClient();

  // Restore saved settings
  const savedHost = localStorage.getItem('mqtt_host');
  const savedPort = localStorage.getItem('mqtt_port');
  const savedUsername = localStorage.getItem('mqtt_username');
  const savedPassword = localStorage.getItem('mqtt_password');
  const savedClientId = localStorage.getItem('mqtt_clientId');

  if (savedHost) document.getElementById('mqttHost').value = savedHost;
  if (savedPort) document.getElementById('mqttPort').value = savedPort;
  if (savedUsername) document.getElementById('mqttUsername').value = savedUsername;
  if (savedPassword) document.getElementById('mqttPassword').value = savedPassword;
  if (savedClientId) document.getElementById('mqttClientId').value = savedClientId;

  if (savedHost) {
    document.getElementById('infoSaved').textContent = 'Ya';
    document.getElementById('infoBroker').textContent = `${savedHost}:${savedPort || '8884'}`;
  }
});
