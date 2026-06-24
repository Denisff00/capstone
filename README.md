# 🌿 AgroSense — Smart Agriculture System

> Sistem pertanian cerdas berbasis ESP32 untuk monitoring kelembaban tanah, suhu, dan kelembaban udara, dilengkapi kontrol otomatis pompa air dan sprayer fungisida melalui dashboard web real-time.

[![Arduino](https://img.shields.io/badge/Arduino-ESP32-blue?logo=arduino)](https://www.arduino.cc/)
[![MQTT](https://img.shields.io/badge/Protocol-MQTT-orange)](https://mqtt.org/)
[![Firebase](https://img.shields.io/badge/Database-Firebase-yellow?logo=firebase)](https://firebase.google.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## 📋 Daftar Isi

- [Gambaran Umum](#gambaran-umum)
- [Arsitektur Sistem](#arsitektur-sistem)
- [Struktur Repositori](#struktur-repositori)
- [Hardware](#hardware)
- [Instalasi & Setup](#instalasi--setup)
- [Cara Menjalankan](#cara-menjalankan)
- [Fitur Dashboard](#fitur-dashboard)
- [Program Percobaan (coba/)](#program-percobaan-coba)
- [Alur Data](#alur-data)
- [MQTT Topics](#mqtt-topics)
- [Troubleshooting](#troubleshooting)

---

## Gambaran Umum

AgroSense adalah sistem IoT pertanian cerdas yang terdiri dari tiga komponen utama:

| Komponen | Teknologi | Fungsi |
|---|---|---|
| **Firmware ESP32** | Arduino C++ | Baca sensor, kontrol relay, komunikasi MQTT |
| **Dashboard Web** | HTML + Vanilla JS | Monitoring real-time, kontrol manual, jadwal spray |
| **Cloud Database** | Firebase RTDB | Penyimpanan data historis, autentikasi pengguna |

---

## Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────┐
│                     CLOUD (Firebase)                     │
│  ┌─────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │ Auth        │  │ Realtime DB    │  │ History Data │  │
│  └─────────────┘  └────────────────┘  └──────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────┐
│                   LOCAL NETWORK                          │
│                                                          │
│  ┌────────────────┐       ┌───────────────────────────┐ │
│  │  Dashboard Web  │ MQTT  │   Mosquitto Broker         │ │
│  │  (Browser)     │◄─────►│   Port 1883 (TCP)          │ │
│  │                │  WS   │   Port 9001 (WebSocket)    │ │
│  └────────────────┘       └──────────────┬────────────┘ │
│                                          │ MQTT TCP      │
│                            ┌─────────────▼────────────┐ │
│                            │        ESP32 DevKit V1    │ │
│                            │  ┌──────┐  ┌──────────┐  │ │
│                            │  │ DHT22│  │ Soil     │  │ │
│                            │  │ Temp │  │ Moisture │  │ │
│                            │  │ Hum  │  │ Sensor   │  │ │
│                            │  └──────┘  └──────────┘  │ │
│                            │  ┌──────┐  ┌──────────┐  │ │
│                            │  │Relay │  │ Relay    │  │ │
│                            │  │Pompa │  │ Sprayer  │  │ │
│                            │  └──────┘  └──────────┘  │ │
│                            └──────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Struktur Repositori

```
CAPSTONE2/
│
├── 📁 firmware/                        ← Firmware utama ESP32 (produksi)
│   ├── agrosense_firmware/
│   │   └── agrosense_firmware.ino      ← Sketch utama (semua fitur)
│   ├── config.h                        ← Konfigurasi WiFi, MQTT, Firebase, Pin
│   └── README.md                       ← Dokumentasi firmware
│
├── 📁 coba/                            ← Program percobaan (testing)
│   ├── firmware/
│   │   ├── spray_scheduler/            ← Percobaan 1: Jadwal penyemprotan
│   │   │   ├── spray_scheduler.ino
│   │   │   └── config.h
│   │   └── threshold_test/             ← Percobaan 2: Kontrol threshold live
│   │       ├── threshold_test.ino
│   │       └── config.h
│   ├── dashboard/                      ← Dashboard percobaan (spray scheduler)
│   ├── dashboard_threshold/            ← Dashboard percobaan (threshold control)
│   │   └── index.html
│   └── README.md                       ← Dokumentasi percobaan
│
├── 📄 index.html                       ← Dashboard utama
├── 📄 app.js                           ← Logika dashboard (MQTT + Firebase)
├── 📄 style.css                        ← Styling dashboard utama
├── 📄 history.html                     ← Halaman riwayat data
├── 📄 history.js                       ← Logika halaman riwayat
├── 📄 history.css                      ← Styling halaman riwayat
└── 📄 firebase-config.js               ← Konfigurasi Firebase SDK
```

---

## Hardware

### Komponen yang Dibutuhkan

| Komponen | Spesifikasi | Jumlah |
|---|---|---|
| Mikrokontroler | ESP32 DevKit V1 | 1 |
| Sensor Kelembaban Tanah | Capacitive Soil Moisture v2.0 | 1 |
| Sensor Suhu & Kelembaban Udara | DHT22 (AM2302) | 1 |
| Modul Relay | 2-Channel, Active LOW | 1 |
| Resistor | 10 kΩ (pull-up DHT22) | 1 |
| Kabel Jumper | Male-to-Female | Secukupnya |

### Wiring Diagram

```
ESP32 DevKit V1
│
├── GPIO 34 ──── Soil Moisture Signal (AOUT)   [INPUT ONLY]
├── GPIO  4 ──── DHT22 Data ──── 10kΩ ──── 3.3V
├── GPIO 26 ──── Relay IN1 (Pompa Air)
├── GPIO 27 ──── Relay IN2 (Sprayer Fungisida)
│
├── 3.3V ──────── DHT22 VCC
├── 3.3V ──────── Soil Moisture VCC
├── GND ───────── DHT22 GND / Soil Moisture GND / Relay GND
└── VIN (5V) ──── Relay VCC

⚠️  Motor (pompa/sprayer) menggunakan power supply 12V TERPISAH
    Jangan supply motor dari pin ESP32!
```

---

## Instalasi & Setup

### 1. Arduino IDE

**Install ESP32 Board:**
1. Buka `File → Preferences`
2. Tambahkan URL berikut ke *Additional Board Manager URLs*:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. `Tools → Board → Boards Manager` → cari `esp32` → install **"esp32 by Espressif Systems"**
4. Pilih board: `Tools → Board → ESP32 Arduino → ESP32 Dev Module`

**Install Library** (via Library Manager — `Ctrl+Shift+I`):

| Library | Versi | Author |
|---|---|---|
| `PubSubClient` | ≥ 2.8 | Nick O'Leary |
| `DHT sensor library` | ≥ 1.4.6 | Adafruit |
| `ArduinoJson` | ≥ 7.0 | Benoit Blanchon |
| `NTPClient` | ≥ 3.2 | Fabrice Weinberg |
| `Adafruit Unified Sensor` | ≥ 1.1 | Adafruit |

### 2. Mosquitto MQTT Broker

**Install Mosquitto** di komputer yang menjadi broker (bisa laptop yang sama dengan dashboard):

```bash
# Windows: Download dari https://mosquitto.org/download/
# Setelah install, edit C:\mosquitto\mosquitto.conf:
```

Isi file `mosquitto.conf`:
```conf
# Listener untuk ESP32 (TCP)
listener 1883
allow_anonymous true

# Listener untuk Dashboard Web (WebSocket)
listener 9001
protocol websockets
allow_anonymous true
```

```bash
# Restart Mosquitto (Command Prompt sebagai Administrator):
net stop mosquitto
net start mosquitto
```

### 3. Firebase

1. Buat project di [Firebase Console](https://console.firebase.google.com/)
2. Aktifkan **Realtime Database** dan **Authentication (Email/Password)**
3. Salin konfigurasi ke `firebase-config.js`
4. Salin **Database Secret** ke `config.h` → `FIREBASE_AUTH`

### 4. Konfigurasi Firmware

Edit `firmware/agrosense_firmware/config.h` (atau `config.h` yang ada di folder sketch):

```c
// WiFi
#define WIFI_SSID       "nama_wifi_kamu"
#define WIFI_PASSWORD   "password_wifi"

// MQTT — IP komputer yang menjalankan Mosquitto
#define MQTT_BROKER     "192.168.x.x"   // cek dengan: ipconfig (Windows)

// Firebase
#define FIREBASE_HOST   "your-project.firebasedatabase.app"
#define FIREBASE_AUTH   "your-database-secret"
```

---

## Cara Menjalankan

```
1. Upload firmware ke ESP32 via Arduino IDE
        ↓
2. Jalankan Mosquitto di komputer
        ↓
3. Buka index.html di browser
        ↓
4. Login dengan akun Firebase
        ↓
5. Masukkan IP Mosquitto di panel MQTT → klik Hubungkan
        ↓
6. Dashboard aktif — data real dari ESP32 masuk! ✅
```

> **💡 Tip:** Setelah pertama kali berhasil terhubung, IP broker disimpan otomatis. Kunjungan berikutnya akan **auto-connect** tanpa perlu isi ulang.

---

## Fitur Dashboard

### Panel MQTT (Koneksi ke ESP32)
- Connect/Disconnect ke Mosquitto broker via WebSocket
- Auto-connect dengan IP tersimpan saat halaman dibuka
- Indikator status koneksi real-time

### Monitoring Sensor
- **Kelembaban Tanah** (%) — dengan gauge visual
- **Suhu Udara** (°C) — dari sensor DHT22
- **Kelembaban Udara** (%) — dari sensor DHT22
- Grafik historis (Chart.js) — data update tiap 3 detik dari ESP32

### Kontrol Motor
| Kontrol | Cara Kerja |
|---|---|
| **Toggle Pompa** | Kirim MQTT command → ESP32 aktifkan/matikan relay pompa |
| **Toggle Sprayer** | Kirim MQTT command + durasi → ESP32 auto-stop setelah durasi selesai |

### Auto-Watering (Penyiraman Otomatis)
- Atur **Batas Bawah** (% mulai siram) — dikirim ke ESP32 via MQTT
- Atur **Batas Atas** (% stop siram) — dikirim ke ESP32 via MQTT
- Atur **Durasi Maks** penyiraman
- Toggle Enable/Disable — konfigurasi disimpan ke Firebase

### Jadwal Penyemprotan Fungisida
- Tambah jadwal: pilih hari, jam, dan durasi
- Jadwal disimpan ke **NVS (flash ESP32)** — tidak hilang saat restart
- Kirim ke ESP32 via MQTT saat MQTT terhubung
- Countdown ke penyemprotan berikutnya

### Firebase Integration
- **Autentikasi** Email/Password
- **Simpan data sensor** tiap 10 detik ke Realtime Database
- **Simpan event motor** (pompa/sprayer ON/OFF)
- **Halaman Riwayat** (`history.html`) — grafik data 24 jam terakhir
- **Auto-cleanup** data lebih dari 30 hari

---

## Program Percobaan (`coba/`)

Program percobaan digunakan untuk menguji fitur secara terpisah sebelum diintegrasikan ke firmware utama.

### Percobaan 1: Spray Scheduler (`coba/firmware/spray_scheduler/`)

**Tujuan:** Menguji penjadwalan penyemprotan fungisida menggunakan Web Server lokal (tanpa MQTT, tanpa Firebase).

**Fitur yang diuji:**
- REST API pada ESP32 (`GET/POST/DELETE /api/schedules`)
- Penyimpanan jadwal ke NVS (persisten setelah restart)
- Trigger spray otomatis berdasarkan waktu (NTPClient)
- Manual spray via API

**Cara jalankan:**
1. Upload `spray_scheduler.ino` ke ESP32
2. Buka Serial Monitor → catat IP address ESP32
3. Buka browser → akses `http://<IP-ESP32>`

**Hasil yang diadopsi ke firmware utama:**
- ✅ Penyimpanan jadwal ke NVS (`saveSchedules()` / `loadSchedules()`)
- ✅ Timer auto-stop manual spray berbasis durasi

---

### Percobaan 2: Threshold Test (`coba/firmware/threshold_test/`)

**Tujuan:** Memverifikasi bahwa perubahan threshold dari dashboard langsung berpengaruh ke logika auto-watering di ESP32 secara real-time via MQTT.

**Fitur yang diuji:**
- Dashboard → ESP32: publish `agrosense/config/watering`
- ESP32 langsung update `lowThreshold` & `highThreshold`
- ESP32 → Dashboard: konfirmasi threshold aktif dalam setiap publish sensor

**Cara jalankan:**
1. Upload `threshold_test.ino` ke ESP32
2. Pastikan Mosquitto berjalan
3. Buka `coba/dashboard_threshold/index.html` di browser
4. Hubungkan ke Mosquitto → geser slider threshold → lihat perubahan di Serial Monitor ESP32

**Output Serial Monitor saat threshold berubah:**
```
╔══════════════════════════════════════╗
║   THRESHOLD BERUBAH DARI DASHBOARD   ║
╠══════════════════════════════════════╣
║  Enabled : YA → YA
║  Low     : 40% → 25%
║  High    : 70% → 60%
║  Duration: 30 detik
╚══════════════════════════════════════╝
```

---

## Alur Data

### Sensor Data (ESP32 → Dashboard → Firebase)

```
ESP32
  │  Baca ADC (soil moisture) + DHT22 (temp, humidity)
  │  Setiap 3 detik
  ▼
MQTT publish: agrosense/sensor/data
  {"moisture": 55.2, "temperature": 28.1, "humidity": 65.3}
  │
  ▼
Dashboard (browser)
  │  Update gauge, grafik, kartu sensor
  │
  ▼
Firebase (tiap 10 detik)
  agrosense/sensor_readings/{auto-id}
  {"moisture": 55.2, ..., "timestamp": 1234567890000}
```

### Kontrol Motor (Dashboard → ESP32)

```
Dashboard
  │  User toggle pompa ON
  ▼
MQTT publish: agrosense/motor/pump/command
  {"action": "on"}   ← atau {"action": "on", "duration": 60}
  │
  ▼
ESP32
  │  Aktifkan relay pompa
  │  Set pumpSource = "manual"
  ▼
MQTT publish: agrosense/motor/pump/status (retain=true)
  {"state": "on", "source": "manual"}
  │
  ▼
Dashboard
  Update tampilan toggle + indikator status
```

### Konfigurasi Threshold (Dashboard → ESP32)

```
Dashboard
  │  User geser slider low threshold 40% → 25%
  ▼
MQTT publish: agrosense/config/watering
  {"enabled": true, "low": 25, "high": 70, "duration": 30}
  │
  ▼
ESP32
  │  Update lowThreshold = 25
  │  Langsung evaluasi ulang auto-watering
  │  Jika pompa sedang menyala & moisture >= highThreshold → matikan pompa
  ▼
Serial Monitor: tampilkan perubahan threshold
```

---

## MQTT Topics

| Topic | Arah | Keterangan |
|---|---|---|
| `agrosense/sensor/data` | ESP32 → Dashboard | Data sensor tiap 3 detik |
| `agrosense/motor/pump/status` | ESP32 → Dashboard | Status pompa (retained) |
| `agrosense/motor/sprayer/status` | ESP32 → Dashboard | Status sprayer (retained) |
| `agrosense/motor/pump/command` | Dashboard → ESP32 | `{"action":"on/off"}` |
| `agrosense/motor/sprayer/command` | Dashboard → ESP32 | `{"action":"on","duration":60}` |
| `agrosense/config/watering` | Dashboard → ESP32 | `{"enabled":true,"low":40,"high":70,"duration":30}` |
| `agrosense/config/schedule` | Dashboard → ESP32 | Array jadwal penyemprotan |
| `agrosense/system/status` | ESP32 → Dashboard | `"online"` / `"offline"` (LWT) |

---

## Troubleshooting

| Masalah | Kemungkinan Penyebab | Solusi |
|---|---|---|
| WiFi tidak terhubung | SSID/password salah | Periksa `config.h` |
| MQTT tidak terhubung (ESP32) | IP broker salah / Mosquitto tidak jalan | Ping IP broker; cek service Mosquitto |
| Dashboard tidak bisa connect MQTT | Port 9001 tidak aktif | Tambahkan listener 9001 di `mosquitto.conf` |
| Sensor moisture selalu 0% atau 100% | Kalibrasi salah | Lakukan kalibrasi ulang, update `SOIL_DRY_VALUE` / `SOIL_WET_VALUE` |
| DHT22 baca `nan` | Kabel longgar / tidak ada pull-up | Cek wiring; tambahkan resistor 10kΩ |
| Jadwal spray hilang setelah restart | Jadwal belum masuk NVS | Pastikan dashboard terhubung MQTT dan klik Simpan Jadwal |
| Threshold tidak berpengaruh ke ESP32 | MQTT tidak terhubung | Cek koneksi MQTT; pastikan topic `agrosense/config/watering` ter-subscribe |

---

## Lisensi

MIT License — bebas digunakan untuk keperluan pembelajaran dan tugas akhir.

---

*Dibuat untuk Capstone Project — Sistem Pertanian Cerdas (AgroSense)*
