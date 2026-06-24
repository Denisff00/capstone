// ============================================
//  AgroSense — Firebase Configuration
//  Ganti semua nilai "YOUR_..." dengan konfigurasi
//  dari Firebase Console → Project Settings → Web App
// ============================================
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCfTfsUnO92xWc61FZe3dctAKwohvEj6vA",
  authDomain: "capstone-8378c.firebaseapp.com",
  databaseURL: "https://capstone-8378c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "capstone-8378c",
  storageBucket: "capstone-8378c.firebasestorage.app",
  messagingSenderId: "912568360044",
  appId: "1:912568360044:web:562f63bbcefdc61e70cc49",
  measurementId: "G-V1K5VLWNXX"
};

// Inisialisasi Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

// ============================================
//  Konfigurasi Retensi Data
// ============================================
const FIREBASE_CONFIG = {
  DATA_RETENTION_DAYS: 30,              // Simpan data selama 30 hari
  SAVE_INTERVAL_MS: 10000,              // Simpan ke Firebase tiap 10 detik (agar tidak terlalu sering)
  MAX_CHART_POINTS: 500,                // Maks titik data untuk chart histori
  SENSOR_PATH: 'agrosense/sensor_readings',
  MOTOR_PATH: 'agrosense/motor_events',
  CONFIG_PATH: 'agrosense/system_config',
  STATUS_PATH: 'agrosense/system_status',
  ACTIVITY_PATH: 'agrosense/activity_log',
};
