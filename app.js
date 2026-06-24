/* ============================================
   AgroSense — Smart Agriculture Dashboard
   Application Logic
   ============================================ */

// ============================================
// SENSOR SIMULATOR
// Generates realistic simulated sensor data
// ============================================
class SensorSimulator {
  constructor() {
    this.moisture = 55;
    this.temperature = 28;
    this.humidity = 65;

    this.prevMoisture = 55;
    this.prevTemperature = 28;
    this.prevHumidity = 65;

    this.labels = [];
    this.moistureHistory = [];
    this.temperatureHistory = [];
    this.humidityHistory = [];
    this.maxDataPoints = 60;
  }

  update(isWatering) {
    // Store previous values for trend calculation
    this.prevMoisture = this.moisture;
    this.prevTemperature = this.temperature;
    this.prevHumidity = this.humidity;

    // --- Moisture ---
    // Natural drying tendency + noise
    let moistureChange = (Math.random() - 0.55) * 3;
    if (isWatering) {
      moistureChange += 1.5 + Math.random() * 1.5; // increase when watering
    }
    this.moisture = Math.max(8, Math.min(98, this.moisture + moistureChange));

    // --- Temperature ---
    // Simulate diurnal cycle (warmer midday, cooler at night)
    const hour = new Date().getHours();
    const tempTarget = 26 + 7 * Math.sin(((hour - 6) * Math.PI) / 12);
    this.temperature +=
      (tempTarget - this.temperature) * 0.02 + (Math.random() - 0.5) * 0.4;
    this.temperature = Math.max(18, Math.min(42, this.temperature));

    // --- Humidity ---
    // Loosely inversely correlated with temperature
    const humTarget = 80 - (this.temperature - 25) * 1.5;
    this.humidity +=
      (humTarget - this.humidity) * 0.03 + (Math.random() - 0.5) * 2.5;
    this.humidity = Math.max(25, Math.min(98, this.humidity));

    // Record to history
    const now = new Date();
    const timeLabel = now.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    this.labels.push(timeLabel);
    this.moistureHistory.push(parseFloat(this.moisture.toFixed(1)));
    this.temperatureHistory.push(parseFloat(this.temperature.toFixed(1)));
    this.humidityHistory.push(parseFloat(this.humidity.toFixed(1)));

    // Trim old data
    if (this.labels.length > this.maxDataPoints) {
      this.labels.shift();
      this.moistureHistory.shift();
      this.temperatureHistory.shift();
      this.humidityHistory.shift();
    }
  }

  getMoistureStatus() {
    if (this.moisture < 30) return { text: "Kering", class: "danger" };
    if (this.moisture < 60) return { text: "Optimal", class: "success" };
    return { text: "Basah", class: "info" };
  }

  getTrend(current, previous) {
    const diff = current - previous;
    if (Math.abs(diff) < 0.3) return "stable";
    return diff > 0 ? "up" : "down";
  }
}

// ============================================
// AUTO WATERING CONTROLLER
// Threshold-based automatic watering logic
// ============================================
class AutoWateringController {
  constructor() {
    this.enabled = true;
    this.lowThreshold = 40; // start watering below this
    this.highThreshold = 70; // stop watering above this
    this.duration = 30; // seconds
    this.isWatering = false;
    this.wateringTimer = null;
    this.wateringStartTime = null;
  }

  check(moisture, motorController, logger, alertManager) {
    if (!this.enabled) return;

    // Start watering if moisture is too low and not already watering
    if (
      moisture < this.lowThreshold &&
      !this.isWatering &&
      !motorController.pumpManualOverride
    ) {
      this.startWatering(moisture, motorController, logger, alertManager);
    }

    // Stop watering if moisture exceeds high threshold
    if (this.isWatering && moisture >= this.highThreshold) {
      this.stopWatering(motorController, logger, alertManager, "threshold");
    }
  }

  startWatering(moisture, motorController, logger, alertManager) {
    this.isWatering = true;
    this.wateringStartTime = Date.now();
    motorController.setPump(true, "auto");

    logger.log(
      `Penyiraman otomatis dimulai — Kelembaban: ${moisture.toFixed(1)}% (batas: ${this.lowThreshold}%)`,
      "success"
    );
    alertManager.show(
      `🌊 Penyiraman otomatis dimulai (${moisture.toFixed(1)}%)`,
      "success"
    );

    // Auto-stop after configured duration
    if (this.wateringTimer) clearTimeout(this.wateringTimer);
    this.wateringTimer = setTimeout(() => {
      if (this.isWatering) {
        this.stopWatering(motorController, logger, alertManager, "duration");
      }
    }, this.duration * 1000);
  }

  stopWatering(motorController, logger, alertManager, reason) {
    this.isWatering = false;
    motorController.setPump(false, "auto");

    if (this.wateringTimer) {
      clearTimeout(this.wateringTimer);
      this.wateringTimer = null;
    }

    const elapsed = this.wateringStartTime
      ? Math.round((Date.now() - this.wateringStartTime) / 1000)
      : 0;
    const reasonText =
      reason === "threshold"
        ? "target kelembaban tercapai"
        : "durasi selesai";
    logger.log(
      `Penyiraman otomatis selesai (${reasonText}, ${elapsed}s)`,
      "info"
    );
    this.wateringStartTime = null;
  }
}

// ============================================
// FUNGICIDE SCHEDULER
// CRUD management for spray schedules
// ============================================
class FungicideScheduler {
  constructor() {
    this.schedules = [];
    this.nextId = 1;
    this.isSpraying = false;
    this.sprayTimer = null;
    this.lastFiredMinute = null; // Prevent firing multiple times in same minute
  }

  addSchedule(days, time, duration) {
    const schedule = {
      id: this.nextId++,
      days, // Array of JS day indices (0=Sun, 1=Mon, ..., 6=Sat)
      time, // "HH:MM"
      duration, // seconds
      enabled: true,
    };
    this.schedules.push(schedule);
    return schedule;
  }

  removeSchedule(id) {
    this.schedules = this.schedules.filter((s) => s.id !== id);
  }

  check(motorController, logger, alertManager) {
    if (this.isSpraying) return;

    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const minuteKey = `${currentDay}-${currentTime}`;

    // Only fire once per minute
    if (this.lastFiredMinute === minuteKey) return;

    for (const schedule of this.schedules) {
      if (
        schedule.enabled &&
        schedule.days.includes(currentDay) &&
        currentTime === schedule.time
      ) {
        this.lastFiredMinute = minuteKey;
        this.startSpraying(schedule, motorController, logger, alertManager);
        break;
      }
    }
  }

  startSpraying(schedule, motorController, logger, alertManager) {
    this.isSpraying = true;
    motorController.setSprayer(true, "scheduled");

    logger.log(
      `Penyemprotan fungisida terjadwal dimulai — Durasi: ${schedule.duration} detik`,
      "success"
    );
    alertManager.show(
      `🧪 Penyemprotan fungisida dimulai (${schedule.duration}s)`,
      "success"
    );

    this.sprayTimer = setTimeout(() => {
      this.stopSpraying(motorController, logger, alertManager);
    }, schedule.duration * 1000);
  }

  stopSpraying(motorController, logger, alertManager) {
    this.isSpraying = false;
    motorController.setSprayer(false, "scheduled");

    if (this.sprayTimer) {
      clearTimeout(this.sprayTimer);
      this.sprayTimer = null;
    }

    logger.log("Penyemprotan fungisida selesai", "info");
    alertManager.show("Penyemprotan fungisida selesai", "info");
  }

  getNextSchedule() {
    const now = new Date();
    let closest = null;
    let closestDiff = Infinity;

    for (const schedule of this.schedules) {
      if (!schedule.enabled) continue;

      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const targetDate = new Date(now);
        targetDate.setDate(now.getDate() + dayOffset);
        const targetDay = targetDate.getDay();

        if (schedule.days.includes(targetDay)) {
          const [hours, minutes] = schedule.time.split(":").map(Number);
          targetDate.setHours(hours, minutes, 0, 0);

          const diff = targetDate - now;
          if (diff > 0 && diff < closestDiff) {
            closestDiff = diff;
            closest = { schedule, date: targetDate, diff };
          }
        }
      }
    }

    return closest;
  }
}

// ============================================
// MOTOR CONTROLLER
// Manual and automated motor control
// ============================================
class MotorController {
  constructor() {
    this.pumpOn = false;
    this.sprayerOn = false;
    this.pumpSource = null; // 'manual' | 'auto' | 'scheduled'
    this.sprayerSource = null;
    this.pumpManualOverride = false;
  }

  setPump(state, source) {
    this.pumpOn = state;
    this.pumpSource = state ? source : null;
  }

  setSprayer(state, source) {
    this.sprayerOn = state;
    this.sprayerSource = state ? source : null;
  }

  togglePumpManual(logger, alertManager) {
    // If overriding auto mode, warn the user
    if (this.pumpOn && this.pumpSource === "auto") {
      alertManager.show(
        "⚠️ Manual override: Pompa dimatikan dari mode otomatis",
        "warning"
      );
      this.pumpManualOverride = true;
    }

    this.pumpOn = !this.pumpOn;
    this.pumpSource = this.pumpOn ? "manual" : null;

    if (!this.pumpOn) {
      this.pumpManualOverride = false;
    }

    logger.log(
      `Motor pompa air ${this.pumpOn ? "DINYALAKAN" : "DIMATIKAN"} secara manual`,
      this.pumpOn ? "success" : "info"
    );
    alertManager.show(
      `💧 Pompa air: ${this.pumpOn ? "ON" : "OFF"}`,
      this.pumpOn ? "success" : "info"
    );
  }

  toggleSprayerManual(logger, alertManager) {
    this.sprayerOn = !this.sprayerOn;
    this.sprayerSource = this.sprayerOn ? "manual" : null;

    logger.log(
      `Motor sprayer fungisida ${this.sprayerOn ? "DINYALAKAN" : "DIMATIKAN"} secara manual`,
      this.sprayerOn ? "success" : "info"
    );
    alertManager.show(
      `🧪 Sprayer: ${this.sprayerOn ? "ON" : "OFF"}`,
      this.sprayerOn ? "success" : "info"
    );
  }
}

// ============================================
// CHART MANAGER
// Chart.js initialization and updates
// ============================================
class ChartManager {
  constructor() {
    this.moistureChart = null;
    this.tempHumidityChart = null;
  }

  init() {
    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.9)",
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
            maxTicksLimit: 8,
            maxRotation: 0,
            font: { size: 10, family: "'Inter', sans-serif" },
            color: "#94a3b8",
          },
          grid: { display: false },
        },
      },
      animation: { duration: 500, easing: "easeInOutQuart" },
    };

    // --- Moisture Chart ---
    const moistureCtx = document
      .getElementById("moistureChart")
      .getContext("2d");

    // Create gradient fill
    const moistureGradient = moistureCtx.createLinearGradient(0, 0, 0, 250);
    moistureGradient.addColorStop(0, "rgba(34, 197, 94, 0.25)");
    moistureGradient.addColorStop(1, "rgba(34, 197, 94, 0.02)");

    this.moistureChart = new Chart(moistureCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Kelembaban Tanah (%)",
            data: [],
            borderColor: "#22c55e",
            backgroundColor: moistureGradient,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: "#22c55e",
            borderWidth: 2.5,
          },
        ],
      },
      options: {
        ...commonOptions,
        plugins: {
          ...commonOptions.plugins,
          legend: { display: false },
        },
        scales: {
          ...commonOptions.scales,
          y: {
            min: 0,
            max: 100,
            ticks: {
              stepSize: 25,
              font: { size: 10, family: "'Inter', sans-serif" },
              color: "#94a3b8",
              callback: (v) => v + "%",
            },
            grid: { color: "rgba(0, 0, 0, 0.04)", drawBorder: false },
          },
        },
      },
    });

    // --- Temperature & Humidity Chart ---
    const thCtx = document
      .getElementById("tempHumidityChart")
      .getContext("2d");

    this.tempHumidityChart = new Chart(thCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Suhu (°C)",
            data: [],
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.05)",
            fill: false,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: "#f59e0b",
            borderWidth: 2.5,
            yAxisID: "yTemp",
          },
          {
            label: "Kelembaban Udara (%)",
            data: [],
            borderColor: "#06b6d4",
            backgroundColor: "rgba(6, 182, 212, 0.05)",
            fill: false,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: "#06b6d4",
            borderWidth: 2.5,
            yAxisID: "yHumidity",
          },
        ],
      },
      options: {
        ...commonOptions,
        plugins: {
          ...commonOptions.plugins,
          legend: {
            display: true,
            position: "top",
            align: "end",
            labels: {
              usePointStyle: true,
              pointStyle: "circle",
              padding: 16,
              font: { size: 11, family: "'Inter', sans-serif" },
              color: "#475569",
            },
          },
        },
        scales: {
          ...commonOptions.scales,
          yTemp: {
            type: "linear",
            position: "left",
            min: 15,
            max: 45,
            ticks: {
              font: { size: 10, family: "'Inter', sans-serif" },
              color: "#f59e0b",
              callback: (v) => v + "°C",
            },
            grid: { color: "rgba(0, 0, 0, 0.04)", drawBorder: false },
          },
          yHumidity: {
            type: "linear",
            position: "right",
            min: 20,
            max: 100,
            ticks: {
              font: { size: 10, family: "'Inter', sans-serif" },
              color: "#06b6d4",
              callback: (v) => v + "%",
            },
            grid: { display: false, drawBorder: false },
          },
        },
      },
    });
  }

  update(simulator) {
    // Update moisture chart data
    this.moistureChart.data.labels = [...simulator.labels];
    this.moistureChart.data.datasets[0].data = [...simulator.moistureHistory];
    this.moistureChart.update("none");

    // Update temp/humidity chart data
    this.tempHumidityChart.data.labels = [...simulator.labels];
    this.tempHumidityChart.data.datasets[0].data = [
      ...simulator.temperatureHistory,
    ];
    this.tempHumidityChart.data.datasets[1].data = [
      ...simulator.humidityHistory,
    ];
    this.tempHumidityChart.update("none");
  }
}

// ============================================
// ACTIVITY LOGGER
// Records and displays system activity
// ============================================
class ActivityLogger {
  constructor(maxEntries = 100) {
    this.entries = [];
    this.maxEntries = maxEntries;
    this.container = null;
  }

  init() {
    this.container = document.getElementById("activityLog");
    this.log("Sistem Capstone Smart Green dimulai", "info");
    this.log("Sensor terhubung — pembacaan data aktif", "success");
    this.log("Mode penyiraman otomatis aktif", "info");
  }

  log(message, type = "info") {
    const now = new Date();
    const time = now.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    this.entries.unshift({ time, message, type });

    if (this.entries.length > this.maxEntries) {
      this.entries.pop();
    }

    this.render();
  }

  render() {
    if (!this.container) return;

    const icons = {
      info: "fa-info-circle",
      success: "fa-check-circle",
      warning: "fa-exclamation-triangle",
      danger: "fa-times-circle",
    };

    this.container.innerHTML = this.entries
      .map(
        (entry) => `
      <div class="log-entry log-${entry.type}">
        <i class="fas ${icons[entry.type]} log-icon"></i>
        <span class="log-time">${entry.time}</span>
        <span class="log-message">${entry.message}</span>
      </div>
    `
      )
      .join("");
  }

  clear() {
    this.entries = [];
    this.render();
  }
}

// ============================================
// ALERT MANAGER
// Toast notification system
// ============================================
class AlertManager {
  constructor() {
    this.container = null;
  }

  init() {
    this.container = document.getElementById("toastContainer");
  }

  show(message, type = "info", duration = 4000) {
    if (!this.container) return;

    const icons = {
      info: "fa-info-circle",
      success: "fa-check-circle",
      warning: "fa-exclamation-triangle",
      danger: "fa-times-circle",
    };

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="fas ${icons[type]} toast-icon"></i>
      <span class="toast-message">${message}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">
        <i class="fas fa-times"></i>
      </button>
    `;

    this.container.appendChild(toast);

    // Auto-dismiss
    setTimeout(() => {
      toast.classList.add("toast-exit");
      setTimeout(() => {
        if (toast.parentElement) toast.remove();
      }, 300);
    }, duration);
  }
}

// ============================================
// DASHBOARD — Main Orchestrator
// ============================================
class Dashboard {
  constructor() {
    this.sensor = new SensorSimulator();
    this.autoWatering = new AutoWateringController();
    this.scheduler = new FungicideScheduler();
    this.motor = new MotorController();
    this.charts = new ChartManager();
    this.logger = new ActivityLogger();
    this.alerts = new AlertManager();
    this.mqtt = new MQTTClient(this);   // MQTT client
    this.firebase = new FirebaseManager(this); // Firebase manager

    this.updateInterval = null;
    this.countdownInterval = null;
    this.startTime = new Date();
    this.liveMode = false;   // true = data from ESP32 via MQTT

    // Alert cooldown to prevent spam
    this.lastMoistureAlert = 0;
    this.moistureAlertCooldown = 30000; // 30 seconds
  }

  init() {
    this.logger.init();
    this.alerts.init();
    this.charts.init();
    this.bindEvents();
    this.loadDefaults();
    this.initHamburgerMenu();

    // Tampilkan UI awal dalam kondisi menunggu data ESP32
    this.updateUI();

    // Start periodic updates (hanya untuk cek jadwal + countdown — simulator dinonaktifkan)
    this.startUpdating();

    // Start countdown timer & clock (updates every second)
    this.updateClock();
    this.countdownInterval = setInterval(() => {
      this.updateCountdown();
      this.updateUptime();
      this.updateClock();
    }, 1000);

    console.log('🌿 Capstone Smart Green Dashboard initialized — Menunggu data dari ESP32...');
  }

  initHamburgerMenu() {
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

  bindEvents() {
    // Manual pump toggle
    document.getElementById("pumpToggle").addEventListener("change", () => {
      const newState = document.getElementById('pumpToggle').checked;
      if (this.mqtt.isConnected()) {
        // In live mode: publish command, wait for ESP32 status feedback
        this.mqtt.publish('agrosense/motor/pump/command', { action: newState ? 'on' : 'off' });
        this.logger.log(`Perintah pompa ${newState ? 'ON' : 'OFF'} dikirim ke ESP32`, newState ? 'success' : 'info');
      } else {
        this.motor.togglePumpManual(this.logger, this.alerts);
        this.updateUI();
        // Save motor event ke Firebase (simulasi mode)
        this.firebase.saveMotorEvent('pump', this.motor.pumpOn ? 'on' : 'off', 'manual');
      }
    });

    // Manual sprayer toggle
    document
      .getElementById("sprayerToggle")
      .addEventListener("change", () => {
        const newState = document.getElementById('sprayerToggle').checked;
        if (this.mqtt.isConnected()) {
          this.mqtt.publish('agrosense/motor/sprayer/command', { action: newState ? 'on' : 'off' });
          this.logger.log(`Perintah sprayer ${newState ? 'ON' : 'OFF'} dikirim ke ESP32`, newState ? 'success' : 'info');
        } else {
          this.motor.toggleSprayerManual(this.logger, this.alerts);
          this.updateUI();
          // Save motor event ke Firebase (simulasi mode)
          this.firebase.saveMotorEvent('sprayer', this.motor.sprayerOn ? 'on' : 'off', 'manual');
        }
      });

    // Auto watering toggle
    document
      .getElementById("autoWateringToggle")
      .addEventListener("change", (e) => {
        this.autoWatering.enabled = e.target.checked;
        this.logger.log(
          `Mode penyiraman otomatis: ${this.autoWatering.enabled ? "AKTIF" : "NONAKTIF"}`,
          this.autoWatering.enabled ? "success" : "warning"
        );
        this.alerts.show(
          `Auto watering ${this.autoWatering.enabled ? "diaktifkan" : "dinonaktifkan"}`,
          this.autoWatering.enabled ? "success" : "warning"
        );
        this.updateUI();
      });

    // Low threshold slider
    document
      .getElementById("lowThreshold")
      .addEventListener("input", (e) => {
        this.autoWatering.lowThreshold = parseInt(e.target.value);
        document.getElementById("lowThresholdValue").textContent = e.target.value + "%";
        if (this.mqtt.isConnected()) this.publishWateringConfig();
        // Persist ke Firebase bahkan tanpa MQTT
        this.firebase.saveConfig({
          enabled: this.autoWatering.enabled,
          low: this.autoWatering.lowThreshold,
          high: this.autoWatering.highThreshold,
          duration: this.autoWatering.duration,
        });
      });

    // High threshold slider
    document
      .getElementById("highThreshold")
      .addEventListener("input", (e) => {
        this.autoWatering.highThreshold = parseInt(e.target.value);
        document.getElementById("highThresholdValue").textContent = e.target.value + "%";
        if (this.mqtt.isConnected()) this.publishWateringConfig();
        // Persist ke Firebase bahkan tanpa MQTT
        this.firebase.saveConfig({
          enabled: this.autoWatering.enabled,
          low: this.autoWatering.lowThreshold,
          high: this.autoWatering.highThreshold,
          duration: this.autoWatering.duration,
        });
      });

    // Watering duration
    document
      .getElementById("wateringDuration")
      .addEventListener("change", (e) => {
        this.autoWatering.duration = parseInt(e.target.value) || 30;
        if (this.mqtt.isConnected()) this.publishWateringConfig();
        // Persist ke Firebase bahkan tanpa MQTT
        this.firebase.saveConfig({
          enabled: this.autoWatering.enabled,
          low: this.autoWatering.lowThreshold,
          high: this.autoWatering.highThreshold,
          duration: this.autoWatering.duration,
        });
      });

    // Auto-watering toggle — also sync to ESP32 + Firebase
    document.getElementById("autoWateringToggle").addEventListener("change", (e) => {
      if (this.mqtt.isConnected()) this.publishWateringConfig();
      // Persist ke Firebase bahkan tanpa MQTT
      this.firebase.saveConfig({
        enabled: this.autoWatering.enabled,
        low: this.autoWatering.lowThreshold,
        high: this.autoWatering.highThreshold,
        duration: this.autoWatering.duration,
      });
    });

    // Add schedule button
    document
      .getElementById("addScheduleBtn")
      .addEventListener("click", () => {
        this.addSchedule();
      });

    // Clear log button
    document.getElementById("clearLogBtn").addEventListener("click", () => {
      this.logger.clear();
      this.alerts.show("Log aktivitas dibersihkan", "info");
    });
  }

  loadDefaults() {
    // Apply default values to UI
    document.getElementById("autoWateringToggle").checked =
      this.autoWatering.enabled;
    document.getElementById("lowThreshold").value =
      this.autoWatering.lowThreshold;
    document.getElementById("highThreshold").value =
      this.autoWatering.highThreshold;
    document.getElementById("lowThresholdValue").textContent =
      this.autoWatering.lowThreshold + "%";
    document.getElementById("highThresholdValue").textContent =
      this.autoWatering.highThreshold + "%";
    document.getElementById("wateringDuration").value =
      this.autoWatering.duration;

    // Add default schedule: Monday, Wednesday, Friday at 07:00
    this.scheduler.addSchedule([1, 3, 5], "07:00", 60);
    this.renderSchedules();
  }

  startUpdating() {
    // Interval ini hanya dipakai untuk cek jadwal & countdown
    // Sensor data sepenuhnya dari ESP32 via MQTT — simulator TIDAK dijalankan
    this.updateInterval = setInterval(() => {
      if (!this.liveMode) return;   // Tidak ada yang perlu dilakukan tanpa koneksi ESP32
      // Cek jadwal lokal (hanya sebagai fallback jika MQTT tidak mengirim trigger)
      this.scheduler.check(this.motor, this.logger, this.alerts);
    }, 3000);
  }

  // Switch antara live (MQTT) dan waiting mode
  setLiveMode(enabled) {
    this.liveMode = enabled;
    this.logger.log(
      enabled ? '🛰️ Mode Live aktif — menerima data langsung dari ESP32' : '⏳ Menunggu koneksi ESP32...',
      enabled ? 'success' : 'warning'
    );
    if (!enabled) {
      // Reset tampilan sensor ke placeholder saat koneksi terputus
      document.getElementById('moistureValue').textContent = '--.--%';
      document.getElementById('temperatureValue').textContent = '--.-°C';
      document.getElementById('humidityValue').textContent = '--.--%';
      document.getElementById('gaugeValue').textContent = '--%';
      document.getElementById('gaugeStatus').textContent = 'Menunggu...';
    }
  }

  // Publish auto-watering config ke ESP32
  publishWateringConfig() {
    this.mqtt.publish('agrosense/config/watering', {
      enabled: this.autoWatering.enabled,
      low: this.autoWatering.lowThreshold,
      high: this.autoWatering.highThreshold,
      duration: this.autoWatering.duration,
    });
    // Persist to Firebase
    this.firebase.saveConfig({
      enabled: this.autoWatering.enabled,
      low: this.autoWatering.lowThreshold,
      high: this.autoWatering.highThreshold,
      duration: this.autoWatering.duration,
    });
  }

  // Publish jadwal fungisida ke ESP32
  publishSchedules() {
    const payload = {
      schedules: this.scheduler.schedules.map(s => ({
        days: s.days,
        time: s.time,
        duration: s.duration,
      })),
    };
    this.mqtt.publish('agrosense/config/schedule', payload);
    // Persist to Firebase
    this.firebase.saveSchedules(this.scheduler.schedules);
  }

  // Update connection badge di header
  updateConnectionBadge(status) {
    const badge = document.getElementById('connectionBadge');
    const dot = badge ? badge.querySelector('.pulse-dot') : null;
    const text = badge ? badge.querySelector('span:last-child') : null;
    if (!badge) return;

    badge.className = `connection-badge badge-${status}`;
    if (dot) dot.className = `pulse-dot dot-${status === 'online' ? '' : status}`;
    if (text) text.textContent = status === 'online' ? 'Online' : 'Offline';
  }

  // ========================
  // UI UPDATE METHODS
  // ========================

  updateUI() {
    this.updateStatusCards();
    this.updateGauge();
    this.updateMotorStatus();
  }

  updateStatusCards() {
    // Moisture
    document.getElementById("moistureValue").textContent =
      this.sensor.moisture.toFixed(1) + "%";
    this.updateTrend(
      "moistureTrend",
      this.sensor.getTrend(this.sensor.moisture, this.sensor.prevMoisture)
    );

    // Temperature
    document.getElementById("temperatureValue").textContent =
      this.sensor.temperature.toFixed(1) + "°C";
    this.updateTrend(
      "temperatureTrend",
      this.sensor.getTrend(
        this.sensor.temperature,
        this.sensor.prevTemperature
      )
    );

    // Humidity
    document.getElementById("humidityValue").textContent =
      this.sensor.humidity.toFixed(1) + "%";
    this.updateTrend(
      "humidityTrend",
      this.sensor.getTrend(this.sensor.humidity, this.sensor.prevHumidity)
    );
  }

  updateTrend(elementId, trend) {
    const el = document.getElementById(elementId);
    const icons = {
      up: "fa-arrow-up",
      down: "fa-arrow-down",
      stable: "fa-minus",
    };
    const classes = {
      up: "trend-up",
      down: "trend-down",
      stable: "trend-stable",
    };

    el.className = `card-trend ${classes[trend]}`;
    el.innerHTML = `<i class="fas ${icons[trend]}"></i>`;
  }

  updateGauge() {
    const moisture = this.sensor.moisture;
    const circumference = 2 * Math.PI * 85; // ≈ 534.07
    const offset = circumference * (1 - moisture / 100);

    const gaugeFill = document.getElementById("gaugeFill");
    const gaugeValue = document.getElementById("gaugeValue");
    const gaugeStatus = document.getElementById("gaugeStatus");

    gaugeFill.style.strokeDashoffset = offset;
    gaugeValue.textContent = moisture.toFixed(1) + "%";

    const status = this.sensor.getMoistureStatus();
    gaugeStatus.textContent = status.text;
    gaugeStatus.className = `gauge-status gauge-status-${status.class}`;

    // Dynamic gauge color
    let color;
    if (moisture < 30) color = "#ef4444";
    else if (moisture < 60) color = "#22c55e";
    else color = "#06b6d4";
    gaugeFill.style.stroke = color;
  }

  updateMotorStatus() {
    // --- Pump ---
    const pumpToggle = document.getElementById("pumpToggle");
    const pumpStatus = document.getElementById("pumpStatus");
    const pumpIndicator = document.getElementById("pumpIndicator");
    const pumpSource = document.getElementById("pumpSource");

    pumpToggle.checked = this.motor.pumpOn;
    pumpStatus.textContent = this.motor.pumpOn ? "AKTIF" : "NONAKTIF";
    pumpStatus.className = `motor-status ${this.motor.pumpOn ? "status-on" : "status-off"}`;
    pumpIndicator.className = `status-indicator ${this.motor.pumpOn ? "indicator-on" : "indicator-off"}`;
    pumpSource.textContent = this.motor.pumpOn && this.motor.pumpSource
      ? `(${this.motor.pumpSource})`
      : "";

    // --- Sprayer ---
    const sprayerToggle = document.getElementById("sprayerToggle");
    const sprayerStatus = document.getElementById("sprayerStatus");
    const sprayerIndicator = document.getElementById("sprayerIndicator");
    const sprayerSource = document.getElementById("sprayerSource");

    sprayerToggle.checked = this.motor.sprayerOn;
    sprayerStatus.textContent = this.motor.sprayerOn ? "AKTIF" : "NONAKTIF";
    sprayerStatus.className = `motor-status ${this.motor.sprayerOn ? "status-on" : "status-off"}`;
    sprayerIndicator.className = `status-indicator ${this.motor.sprayerOn ? "indicator-on" : "indicator-off"}`;
    sprayerSource.textContent = this.motor.sprayerOn && this.motor.sprayerSource
      ? `(${this.motor.sprayerSource})`
      : "";
  }

  updateUptime() {
    const diff = Date.now() - this.startTime.getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    document.getElementById("uptimeValue").textContent =
      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  updateClock() {
    const now = new Date();
    const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

    const dayName = dayNames[now.getDay()];
    const date = now.getDate();
    const month = monthNames[now.getMonth()];
    const year = now.getFullYear();

    document.getElementById("clockDate").textContent = `${dayName}, ${date} ${month} ${year}`;
    document.getElementById("clockTime").textContent = now.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  updateCountdown() {
    const next = this.scheduler.getNextSchedule();
    const el = document.getElementById("nextScheduleCountdown");

    if (next) {
      const diff = next.diff;
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      el.textContent = `${h}j ${m}m ${s}d`;
    } else {
      el.textContent = "Tidak ada jadwal";
    }
  }

  // ========================
  // ALERT CHECKING
  // ========================

  checkMoistureAlerts() {
    const now = Date.now();
    if (now - this.lastMoistureAlert < this.moistureAlertCooldown) return;

    const moisture = this.sensor.moisture;

    if (moisture < 20) {
      this.logger.log(
        `⚠️ KRITIS: Kelembaban tanah sangat rendah (${moisture.toFixed(1)}%)`,
        "danger"
      );
      this.alerts.show(
        `🚨 Kelembaban tanah kritis: ${moisture.toFixed(1)}%`,
        "danger",
        6000
      );
      this.lastMoistureAlert = now;
    } else if (moisture > 90) {
      this.logger.log(
        `⚠️ PERINGATAN: Kelembaban tanah terlalu tinggi (${moisture.toFixed(1)}%)`,
        "warning"
      );
      this.alerts.show(
        `⚠️ Kelembaban terlalu tinggi: ${moisture.toFixed(1)}%`,
        "warning",
        5000
      );
      this.lastMoistureAlert = now;
    }
  }

  // ========================
  // SCHEDULE MANAGEMENT
  // ========================

  addSchedule() {
    const dayCheckboxes = document.querySelectorAll(".day-checkbox:checked");
    const time = document.getElementById("scheduleTime").value;
    const duration =
      parseInt(document.getElementById("scheduleDuration").value) || 30;

    if (dayCheckboxes.length === 0) {
      this.alerts.show("Pilih minimal satu hari", "warning");
      return;
    }

    if (!time) {
      this.alerts.show("Masukkan waktu penyemprotan", "warning");
      return;
    }

    const days = Array.from(dayCheckboxes).map((cb) => parseInt(cb.value));
    this.scheduler.addSchedule(days, time, duration);

    this.logger.log(
      `Jadwal penyemprotan ditambahkan: ${time} (${duration}s)`,
      "success"
    );
    this.alerts.show("✅ Jadwal berhasil ditambahkan", "success");
    this.renderSchedules();
    if (this.mqtt.isConnected()) this.publishSchedules();
    // Also persist to Firebase even without MQTT
    this.firebase.saveSchedules(this.scheduler.schedules);

    // Reset form
    dayCheckboxes.forEach((cb) => (cb.checked = false));
    document.getElementById("scheduleTime").value = "";
    document.getElementById("scheduleDuration").value = "30";
  }

  removeSchedule(id) {
    this.scheduler.removeSchedule(id);
    this.logger.log("Jadwal penyemprotan dihapus", "info");
    this.alerts.show("Jadwal dihapus", "info");
    this.renderSchedules();
    if (this.mqtt.isConnected()) this.publishSchedules();
    // Also persist to Firebase even without MQTT
    this.firebase.saveSchedules(this.scheduler.schedules);
  }

  renderSchedules() {
    const container = document.getElementById("scheduleList");
    const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

    if (this.scheduler.schedules.length === 0) {
      container.innerHTML =
        '<div class="no-schedules"><i class="fas fa-calendar-times"></i> Belum ada jadwal</div>';
      return;
    }

    container.innerHTML = this.scheduler.schedules
      .map(
        (schedule) => `
      <div class="schedule-item">
        <div class="schedule-info">
          <div class="schedule-days">
            ${schedule.days.map((d) => `<span class="day-tag">${dayNames[d]}</span>`).join("")}
          </div>
          <div class="schedule-details">
            <i class="fas fa-clock"></i> ${schedule.time} &bull; Durasi: ${schedule.duration}s
          </div>
        </div>
        <button class="btn-icon btn-delete" onclick="dashboard.removeSchedule(${schedule.id})" title="Hapus jadwal">
          <img src="assets/trash.svg" alt="Hapus" style="width: 1.2em; height: 1.2em; vertical-align: middle;">
        </button>
      </div>
    `
      )
      .join("");
  }
}

// ============================================
// FIREBASE MANAGER
// Firebase Realtime Database + Auth integration
// ============================================
class FirebaseManager {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.user = null;
    this.connected = false;
    this.saveEnabled = true;
    this.lastSaveTime = 0;
    this.saveInterval = FIREBASE_CONFIG.SAVE_INTERVAL_MS;
    this.pendingSensorData = null;

    // Listen for auth state changes
    auth.onAuthStateChanged((user) => {
      this.user = user;
      this._onAuthStateChanged(user);
    });

    // Listen for Firebase connection state
    db.ref('.info/connected').on('value', (snap) => {
      this.connected = snap.val() === true;
      this._updateFirebaseBadge();
    });
  }

  // ── Auth Methods ──

  async login(email, password) {
    try {
      const cred = await auth.signInWithEmailAndPassword(email, password);
      return { success: true, user: cred.user };
    } catch (err) {
      return { success: false, error: this._translateAuthError(err.code) };
    }
  }

  async register(email, password) {
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      return { success: true, user: cred.user };
    } catch (err) {
      return { success: false, error: this._translateAuthError(err.code) };
    }
  }

  async logout() {
    try {
      await auth.signOut();
      this.dashboard.logger.log('Anda telah keluar', 'info');
    } catch (err) {
      console.error('[Firebase] Logout error:', err);
    }
  }

  _onAuthStateChanged(user) {
    const overlay = document.getElementById('authOverlay');
    const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');

    if (user) {
      // User logged in → hide overlay, show dashboard
      if (overlay) overlay.classList.add('hidden');
      if (sidebarLogoutBtn) sidebarLogoutBtn.style.display = '';
      this.dashboard.logger.log(`Login berhasil: ${user.email}`, 'success');
      this.dashboard.alerts.show(`✅ Selamat datang, ${user.email}`, 'success');

      // Load saved config from Firebase
      this.loadConfig();
      this.loadSchedules();
    } else {
      // User logged out → show overlay
      if (overlay) overlay.classList.remove('hidden');
      if (sidebarLogoutBtn) sidebarLogoutBtn.style.display = 'none';
    }
  }

  _translateAuthError(code) {
    const errors = {
      'auth/user-not-found': 'Akun tidak ditemukan. Silakan daftar terlebih dahulu.',
      'auth/wrong-password': 'Password salah. Silakan coba lagi.',
      'auth/invalid-email': 'Format email tidak valid.',
      'auth/email-already-in-use': 'Email sudah digunakan. Silakan login.',
      'auth/weak-password': 'Password terlalu lemah (minimal 6 karakter).',
      'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.',
      'auth/network-request-failed': 'Gagal terhubung ke server. Periksa koneksi internet.',
      'auth/invalid-credential': 'Email atau password salah.',
    };
    return errors[code] || `Error: ${code}`;
  }

  // ── Data Persistence ──

  saveSensorReading(moisture, temperature, humidity) {
    if (!this.saveEnabled || !this.user) return;

    const now = Date.now();
    // Throttle: only save at configured interval
    if (now - this.lastSaveTime < this.saveInterval) {
      this.pendingSensorData = { moisture, temperature, humidity };
      return;
    }

    this.lastSaveTime = now;
    this.pendingSensorData = null;

    const reading = {
      moisture: parseFloat(moisture.toFixed(1)),
      temperature: parseFloat(temperature.toFixed(1)),
      humidity: parseFloat(humidity.toFixed(1)),
      timestamp: now,
    };

    db.ref(FIREBASE_CONFIG.SENSOR_PATH).push(reading)
      .then(() => this._flashBadge())
      .catch(err => console.error('[Firebase] Save sensor error:', err));
  }

  saveMotorEvent(type, state, source) {
    if (!this.saveEnabled || !this.user) return;

    const event = {
      type,      // 'pump' | 'sprayer'
      state,     // 'on' | 'off'
      source,    // 'manual' | 'auto' | 'scheduled'
      timestamp: Date.now(),
    };

    db.ref(FIREBASE_CONFIG.MOTOR_PATH).push(event)
      .catch(err => console.error('[Firebase] Save motor event error:', err));
  }

  saveConfig(config) {
    if (!this.user) return;
    db.ref(FIREBASE_CONFIG.CONFIG_PATH + '/autoWatering').set(config)
      .catch(err => console.error('[Firebase] Save config error:', err));
  }

  saveSchedules(schedules) {
    if (!this.user) return;
    const data = schedules.map(s => ({
      days: s.days,
      time: s.time,
      duration: s.duration,
      enabled: s.enabled !== false,
    }));
    db.ref(FIREBASE_CONFIG.CONFIG_PATH + '/schedules').set(data)
      .catch(err => console.error('[Firebase] Save schedules error:', err));
  }

  saveActivityLog(message, type) {
    if (!this.saveEnabled || !this.user) return;
    const entry = {
      message,
      type,
      timestamp: Date.now(),
    };
    db.ref(FIREBASE_CONFIG.ACTIVITY_PATH).push(entry)
      .catch(err => console.error('[Firebase] Save activity error:', err));
  }

  updateSystemStatus(status) {
    if (!this.user) return;
    db.ref(FIREBASE_CONFIG.STATUS_PATH).update({
      esp32Status: status,
      lastOnline: Date.now(),
    }).catch(err => console.error('[Firebase] Update status error:', err));
  }

  // ── Load Data ──

  async loadConfig() {
    if (!this.user) return;
    try {
      const snap = await db.ref(FIREBASE_CONFIG.CONFIG_PATH + '/autoWatering').once('value');
      const config = snap.val();
      if (config) {
        this.dashboard.autoWatering.enabled = config.enabled !== false;
        this.dashboard.autoWatering.lowThreshold = config.low || config.lowThreshold || 40;
        this.dashboard.autoWatering.highThreshold = config.high || config.highThreshold || 70;
        this.dashboard.autoWatering.duration = config.duration || 30;

        // Update UI
        document.getElementById('autoWateringToggle').checked = this.dashboard.autoWatering.enabled;
        document.getElementById('lowThreshold').value = this.dashboard.autoWatering.lowThreshold;
        document.getElementById('highThreshold').value = this.dashboard.autoWatering.highThreshold;
        document.getElementById('lowThresholdValue').textContent = this.dashboard.autoWatering.lowThreshold + '%';
        document.getElementById('highThresholdValue').textContent = this.dashboard.autoWatering.highThreshold + '%';
        document.getElementById('wateringDuration').value = this.dashboard.autoWatering.duration;

        this.dashboard.logger.log('Konfigurasi auto-watering dimuat dari Firebase', 'info');
      }
    } catch (err) {
      console.error('[Firebase] Load config error:', err);
    }
  }

  async loadSchedules() {
    if (!this.user) return;
    try {
      const snap = await db.ref(FIREBASE_CONFIG.CONFIG_PATH + '/schedules').once('value');
      const schedules = snap.val();
      if (schedules && Array.isArray(schedules)) {
        // Clear existing and re-add from Firebase
        this.dashboard.scheduler.schedules = [];
        this.dashboard.scheduler.nextId = 1;
        schedules.forEach(s => {
          if (s && s.days && s.time) {
            this.dashboard.scheduler.addSchedule(s.days, s.time, s.duration || 30);
          }
        });
        this.dashboard.renderSchedules();
        this.dashboard.logger.log(`${schedules.length} jadwal dimuat dari Firebase`, 'info');
      }
    } catch (err) {
      console.error('[Firebase] Load schedules error:', err);
    }
  }

  // ── History Data (for history page) ──

  async loadHistory(hours = 24) {
    const cutoff = Date.now() - (hours * 3600 * 1000);
    try {
      const snap = await db.ref(FIREBASE_CONFIG.SENSOR_PATH)
        .orderByChild('timestamp')
        .startAt(cutoff)
        .limitToLast(FIREBASE_CONFIG.MAX_CHART_POINTS)
        .once('value');

      const data = [];
      snap.forEach(child => {
        data.push({ id: child.key, ...child.val() });
      });
      return data;
    } catch (err) {
      console.error('[Firebase] Load history error:', err);
      return [];
    }
  }

  async loadMotorEvents(hours = 24) {
    const cutoff = Date.now() - (hours * 3600 * 1000);
    try {
      const snap = await db.ref(FIREBASE_CONFIG.MOTOR_PATH)
        .orderByChild('timestamp')
        .startAt(cutoff)
        .limitToLast(200)
        .once('value');

      const data = [];
      snap.forEach(child => {
        data.push({ id: child.key, ...child.val() });
      });
      return data;
    } catch (err) {
      console.error('[Firebase] Load motor events error:', err);
      return [];
    }
  }

  // ── Data Cleanup (30-day retention) ──

  async cleanupOldData() {
    if (!this.user) return;

    const cutoff = Date.now() - (FIREBASE_CONFIG.DATA_RETENTION_DAYS * 24 * 3600 * 1000);
    const paths = [FIREBASE_CONFIG.SENSOR_PATH, FIREBASE_CONFIG.MOTOR_PATH, FIREBASE_CONFIG.ACTIVITY_PATH];

    for (const path of paths) {
      try {
        const snap = await db.ref(path)
          .orderByChild('timestamp')
          .endAt(cutoff)
          .limitToFirst(500)
          .once('value');

        const updates = {};
        snap.forEach(child => {
          updates[child.key] = null; // Delete
        });

        if (Object.keys(updates).length > 0) {
          await db.ref(path).update(updates);
          console.log(`[Firebase] Cleaned ${Object.keys(updates).length} old entries from ${path}`);
        }
      } catch (err) {
        console.error(`[Firebase] Cleanup error for ${path}:`, err);
      }
    }
  }

  // ── UI Updates ──

  _updateFirebaseBadge() {
    const badge = document.getElementById('firebaseBadge');
    const text = document.getElementById('firebaseStatusText');
    if (!badge || !text) return;

    if (this.connected && this.user) {
      badge.className = 'firebase-badge connected';
      text.textContent = 'Firebase Online';
    } else {
      badge.className = 'firebase-badge disconnected';
      text.textContent = 'Firebase Offline';
    }
  }

  _flashBadge() {
    const badge = document.getElementById('firebaseBadge');
    if (!badge) return;
    badge.classList.add('saving');
    setTimeout(() => {
      badge.classList.remove('saving');
      this._updateFirebaseBadge();
    }, 500);
  }

  isConnected() {
    return this.connected && this.user !== null;
  }
}

// ============================================
// AUTH HELPER FUNCTIONS (global — used by HTML onclick)
// ============================================

function toggleAuthMode(showRegister) {
  document.getElementById('authLoginForm').style.display = showRegister ? 'none' : '';
  document.getElementById('authRegisterForm').style.display = showRegister ? '' : 'none';
  // Clear errors
  document.getElementById('authError').style.display = 'none';
  document.getElementById('authRegError').style.display = 'none';
}

async function handleAuthLogin() {
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

  const result = await dashboard.firebase.login(email, password);

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Masuk';

  if (!result.success) {
    errorEl.textContent = result.error;
    errorEl.style.display = '';
  }
}

async function handleAuthRegister() {
  const email = document.getElementById('authRegEmail').value.trim();
  const password = document.getElementById('authRegPassword').value;
  const confirm = document.getElementById('authRegConfirm').value;
  const errorEl = document.getElementById('authRegError');
  const btn = document.getElementById('authRegisterBtn');

  if (!email || !password) {
    errorEl.textContent = 'Masukkan email dan password.';
    errorEl.style.display = '';
    return;
  }

  if (password !== confirm) {
    errorEl.textContent = 'Password dan konfirmasi tidak cocok.';
    errorEl.style.display = '';
    return;
  }

  if (password.length < 6) {
    errorEl.textContent = 'Password minimal 6 karakter.';
    errorEl.style.display = '';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';
  errorEl.style.display = 'none';

  const result = await dashboard.firebase.register(email, password);

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Daftar';

  if (!result.success) {
    errorEl.textContent = result.error;
    errorEl.style.display = '';
  }
}

// ============================================
// MQTT CLIENT
// MQTT.js over Secure WebSocket — connects to HiveMQ Cloud
// ============================================
class MQTTClient {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.client = null;
    this.state = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
    this.reconnectTimer = null;
  }

  connect() {
    // Read from localStorage (set by settings page)
    const host = localStorage.getItem('mqtt_host') || '617ddeac74124ae2ac195ed4ad8f7c08.s1.eu.hivemq.cloud';
    const port = localStorage.getItem('mqtt_port') || '8884';
    const clientId = localStorage.getItem('mqtt_clientId') || 'agrosense-dashboard';
    const username = localStorage.getItem('mqtt_username') || 'capstone-smartgreen';
    const password = localStorage.getItem('mqtt_password') || 'Capstone3';
    const brokerUrl = `wss://${host}:${port}/mqtt`;

    this._setState('connecting');
    this.dashboard.logger.log(`Menghubungkan ke MQTT broker: ${brokerUrl} (TLS)`, 'info');

    // Disconnect existing client if any
    if (this.client) {
      try { this.client.end(true); } catch (e) { }
      this.client = null;
    }

    // Client ID harus UNIK agar tidak bentrok dengan ESP32 atau tab lain
    const uniqueClientId = clientId + '-' + Math.random().toString(16).slice(2, 6);

    const options = {
      clientId: uniqueClientId,
      keepalive: 60,
      reconnectPeriod: 5000,   // Auto-reconnect tiap 5 detik jika terputus
      connectTimeout: 10000,
      clean: true,
    };

    // Tambahkan username/password jika diisi
    if (username) options.username = username;
    if (password) options.password = password;

    this.client = mqtt.connect(brokerUrl, options);

    this.client.on('connect', () => {
      this._setState('connected');
      this.dashboard.logger.log('MQTT terhubung ke broker!', 'success');
      this.dashboard.alerts.show('✅ MQTT terhubung ke broker', 'success');

      // Subscribe ke semua topic dari ESP32
      const topics = [
        'agrosense/sensor/data',
        'agrosense/motor/pump/status',
        'agrosense/motor/sprayer/status',
        'agrosense/system/status',
      ];
      topics.forEach(t => this.client.subscribe(t));

      // Switch ke live mode — hentikan simulator
      this.dashboard.setLiveMode(true);

      // Push konfigurasi saat ini ke ESP32
      this.dashboard.publishWateringConfig();
      this.dashboard.publishSchedules();
    });

    this.client.on('message', (topic, payload) => {
      const msg = payload.toString();
      this._handleMessage(topic, msg);
    });

    this.client.on('error', (err) => {
      console.error('[MQTT] Error:', err);
      this._setState('disconnected');
      // Log error lebih detail agar mudah diagnosa
      let errMsg = err.message || 'Unknown error';
      if (errMsg.includes('Not authorized') || errMsg.includes('unauthorized')) {
        errMsg = 'Autentikasi gagal — periksa username/password HiveMQ';
      } else if (errMsg.includes('ECONNREFUSED') || errMsg.includes('refused')) {
        errMsg = 'Koneksi ditolak — periksa host dan port';
      } else if (errMsg.includes('certificate') || errMsg.includes('SSL')) {
        errMsg = 'Masalah sertifikat TLS/SSL';
      }
      this.dashboard.logger.log(`MQTT error: ${errMsg}`, 'danger');
      this.dashboard.alerts.show(`❌ MQTT Error: ${errMsg}`, 'danger', 6000);
    });

    this.client.on('reconnect', () => {
      this._setState('connecting');
      this.dashboard.logger.log('MQTT mencoba reconnect...', 'info');
    });

    this.client.on('close', () => {
      if (this.state === 'connected') {
        this.dashboard.logger.log('MQTT terputus dari broker', 'warning');
        this.dashboard.alerts.show('⚠️ Koneksi MQTT terputus — mencoba kembali...', 'warning');
      }
      this._setState('disconnected');
      this.dashboard.setLiveMode(false);
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
    this.dashboard.setLiveMode(false);
    this.dashboard.logger.log('MQTT diputuskan secara manual', 'info');
  }

  publish(topic, payload, retain = false) {
    if (!this.client || this.state !== 'connected') return false;
    const msg = typeof payload === 'object' ? JSON.stringify(payload) : String(payload);
    this.client.publish(topic, msg, { qos: 1, retain });
    return true;
  }

  isConnected() {
    return this.state === 'connected';
  }

  _handleMessage(topic, msg) {
    try {
      if (topic === 'agrosense/sensor/data') {
        const data = JSON.parse(msg);
        // Inject real sensor data into the simulator object (reuse existing UI)
        const sim = this.dashboard.sensor;
        sim.prevMoisture = sim.moisture;
        sim.prevTemperature = sim.temperature;
        sim.prevHumidity = sim.humidity;
        sim.moisture = parseFloat(data.moisture) || sim.moisture;
        sim.temperature = parseFloat(data.temperature) || sim.temperature;
        sim.humidity = parseFloat(data.humidity) || sim.humidity;

        // Record to history for chart
        const now = new Date();
        const label = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        sim.labels.push(label);
        sim.moistureHistory.push(parseFloat(sim.moisture.toFixed(1)));
        sim.temperatureHistory.push(parseFloat(sim.temperature.toFixed(1)));
        sim.humidityHistory.push(parseFloat(sim.humidity.toFixed(1)));
        if (sim.labels.length > sim.maxDataPoints) {
          sim.labels.shift(); sim.moistureHistory.shift();
          sim.temperatureHistory.shift(); sim.humidityHistory.shift();
        }

        this.dashboard.charts.update(sim);
        this.dashboard.updateUI();
        this.dashboard.checkMoistureAlerts();

        // ── FIREBASE: Save sensor data ──
        this.dashboard.firebase.saveSensorReading(
          sim.moisture, sim.temperature, sim.humidity
        );
        return;
      }

      if (topic === 'agrosense/motor/pump/status') {
        const data = JSON.parse(msg);
        const m = this.dashboard.motor;
        const prevState = m.pumpOn;
        m.pumpOn = data.state === 'on';
        m.pumpSource = data.source || null;
        this.dashboard.updateMotorStatus();

        // ── FIREBASE: Save motor event ──
        if (prevState !== m.pumpOn) {
          this.dashboard.firebase.saveMotorEvent('pump', data.state, data.source || 'unknown');
        }
        return;
      }

      if (topic === 'agrosense/motor/sprayer/status') {
        const data = JSON.parse(msg);
        const m = this.dashboard.motor;
        const prevState = m.sprayerOn;
        m.sprayerOn = data.state === 'on';
        m.sprayerSource = data.source || null;
        this.dashboard.updateMotorStatus();

        // ── FIREBASE: Save motor event ──
        if (prevState !== m.sprayerOn) {
          this.dashboard.firebase.saveMotorEvent('sprayer', data.state, data.source || 'unknown');
        }
        return;
      }

      if (topic === 'agrosense/system/status') {
        const online = msg === 'online';
        this.dashboard.updateConnectionBadge(online ? 'online' : 'offline');
        this.dashboard.logger.log(
          `ESP32: ${online ? 'Online' : 'Offline'}`,
          online ? 'success' : 'warning'
        );

        // ── FIREBASE: Update system status ──
        this.dashboard.firebase.updateSystemStatus(msg);
        return;
      }
    } catch (e) {
      console.error('[MQTT] Failed to parse message:', topic, msg, e);
    }
  }

  _setState(state) {
    this.state = state;
    this._updateUI(state);
  }

  _updateUI(state) {
    // MQTT panel has been moved to settings.html — update header badge only
    const connBadge = document.getElementById('connectionBadge');
    if (connBadge) {
      const headerCfg = {
        connected: { cls: 'badge-online', text: 'MQTT Online' },
        disconnected: { cls: 'badge-offline', text: 'MQTT Offline' },
        connecting: { cls: '', text: 'Connecting...' },
      }[state];
      connBadge.className = `connection-badge ${headerCfg.cls}`;
      const textEl = connBadge.querySelector('span:last-child');
      if (textEl) textEl.textContent = headerCfg.text;
    }
  }
}

// ============================================
// INITIALIZATION
// ============================================
let dashboard;

document.addEventListener("DOMContentLoaded", () => {
  dashboard = new Dashboard();
  dashboard.init();

  // Auto-connect ke MQTT jika ada broker tersimpan (credentials now in localStorage, set via settings page)
  const savedHost = localStorage.getItem('mqtt_host');
  if (savedHost) {
    const savedPort = localStorage.getItem('mqtt_port') || '8884';
    dashboard.logger.log(`Auto-connect ke MQTT broker: ${savedHost}:${savedPort} (TLS)`, 'info');
    setTimeout(() => dashboard.mqtt.connect(), 1500);
  }

  // Run data cleanup once on load (30-day retention)
  setTimeout(() => {
    if (dashboard.firebase && dashboard.firebase.user) {
      dashboard.firebase.cleanupOldData();
    }
  }, 10000);
});
