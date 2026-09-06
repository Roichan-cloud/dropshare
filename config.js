/* ==========================================================================
   CONFIG.JS
   Satu-satunya file yang perlu kamu ubah.
   Isi FIREBASE_CONFIG dari project Firebase kamu (Project settings > Your apps).
   Nilai di sini aman ditaruh di frontend (bukan rahasia) — keamanan diatur
   lewat Firestore Security Rules & App Check, bukan lewat menyembunyikan config ini.
   ========================================================================== */
const CONFIG = {
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyD5lbNc7Ke4GU6VbbwOqhxb_vWCtjKVvzY",
    authDomain: "dropshare-ian.firebaseapp.com",
    projectId: "dropshare-ian",
    storageBucket: "dropshare-ian.firebasestorage.app", // tidak dipakai (kita cuma pakai Firestore, bukan Storage)
    messagingSenderId: "719378609576",
    appId: "1:719378609576:web:6915a187497c43ec0a599d"
  },

  // Isi dengan reCAPTCHA v3 Site Key kalau sudah setup Firebase App Check.
  // Kosongkan ("") kalau belum setup -> App Check otomatis dilewati, situs tetap jalan normal.
  RECAPTCHA_SITE_KEY: "",

  FILES_COLLECTION: "files",              // Nama collection Firestore untuk simpan file
  // Batas ukuran file. Firestore membatasi 1 dokumen maksimum ~1MB (termasuk overhead),
  // jadi batas ini SENGAJA dibuat di bawah itu supaya selalu aman. Jangan dinaikkan
  // melebihi ~900KB kecuali kamu ganti skema penyimpanan.
  MAX_FILE_SIZE: 999 * 1024,              // 999 KB
  ALLOWED_EXTENSIONS: [".json"],          // Ekstensi file yang diizinkan diunggah

  RECENT_UPLOADS_LIMIT: 15,               // Jumlah maksimum item di "File Terbaru"

  // Jeda minimum antar-upload dari browser yang sama (anti-spam klik berulang).
  // Ini proteksi ringan di sisi client, BUKAN pengganti App Check / Firestore Rules.
  UPLOAD_COOLDOWN_MS: 8000
};
