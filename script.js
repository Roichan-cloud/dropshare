/* ==========================================================================
   SCRIPT.JS
   Logic untuk index.html (upload) dan download.html (download).
   File ini otomatis mendeteksi ada di halaman mana lewat elemen yang tersedia.
   Membutuhkan config.js dan Firebase JS SDK (compat build) dimuat SEBELUM file ini.
   ========================================================================== */

/* --- Init Firebase app + Firestore --- */
firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
const db = firebase.firestore();

/* --- Init App Check (opsional, hanya jalan kalau RECAPTCHA_SITE_KEY diisi) ---
   App Check memastikan hanya request dari halaman web asli kamu yang bisa
   menulis/membaca ke Firestore, ini pengganti "anti-bot/anti-DDoS" tanpa
   perlu server sendiri. Kalau belum setup, baris ini otomatis dilewati. */
if (CONFIG.RECAPTCHA_SITE_KEY && typeof firebase.appCheck === "function") {
  try {
    firebase.appCheck().activate(CONFIG.RECAPTCHA_SITE_KEY, true);
  } catch (err) {
    console.warn("App Check gagal diaktifkan:", err);
  }
}

/* ==========================================================================
   UTIL: Toast Notification
   ========================================================================== */
function showToast(message, type = "info") {
  const wrap = document.getElementById("toastWrap");
  if (!wrap) return;

  const el = document.createElement("div");
  el.className = `toast ${type}`;

  const dot = document.createElement("span");
  dot.className = "dot";

  const text = document.createElement("span");
  text.textContent = message; // textContent -> aman dari XSS, tidak pakai innerHTML

  el.appendChild(dot);
  el.appendChild(text);
  wrap.appendChild(el);

  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity .3s ease";
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

/* ==========================================================================
   UTIL: Format ukuran file jadi human-readable (KB/MB/GB)
   ========================================================================== */
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/* ==========================================================================
   THEME SWITCHER (dipakai di kedua halaman)
   ========================================================================== */
(function initTheme() {
  const saved = localStorage.getItem("dropshare-theme") || "lime";
  applyTheme(saved);

  document.querySelectorAll("[data-theme-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const theme = btn.getAttribute("data-theme-btn");
      applyTheme(theme);
      localStorage.setItem("dropshare-theme", theme);
    });
  });

  function applyTheme(theme) {
    document.body.setAttribute("data-theme", theme);
    document.querySelectorAll("[data-theme-btn]").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-theme-btn") === theme);
    });
  }
})();

/* ==========================================================================
   Notifikasi status koneksi internet
   ========================================================================== */
window.addEventListener("offline", () => showToast("Koneksi internet terputus.", "error"));
window.addEventListener("online", () => showToast("Koneksi internet tersambung kembali.", "success"));

/* ==========================================================================
   ROUTER SEDERHANA
   index.html punya elemen #uploadView -> jalankan initUploadPage()
   download.html punya elemen #downloadView -> jalankan initDownloadPage()
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("uploadView")) initUploadPage();
  if (document.getElementById("downloadView")) initDownloadPage();
});

/* ==========================================================================
   HALAMAN UPLOAD (index.html)
   ========================================================================== */
function initUploadPage() {
  const dropzone   = document.getElementById("dropzone");
  const fileInput  = document.getElementById("fileInput");
  const fileInfo   = document.getElementById("fileInfo");
  const fName      = document.getElementById("fName");
  const fSize      = document.getElementById("fSize");
  const fRemove    = document.getElementById("fRemove");
  const uploadBtn  = document.getElementById("uploadBtn");
  const uploadBtnText = document.getElementById("uploadBtnText");
  const progressWrap  = document.getElementById("progressWrap");
  const progressFill  = document.getElementById("progressFill");
  const progressPct   = document.getElementById("progressPct");
  const progressLabel = document.getElementById("progressLabel");
  const uploadForm  = document.getElementById("uploadForm");
  const resultView  = document.getElementById("resultView");
  const resultLink  = document.getElementById("resultLink");
  const copyBtn     = document.getElementById("copyBtn");
  const openBtn     = document.getElementById("openBtn");
  const resetBtn    = document.getElementById("resetBtn");
  const showInRecentToggle = document.getElementById("showInRecentToggle");

  let selectedFile = null;
  let isUploading  = false;

  // Tampilkan daftar "File Terbaru" saat halaman dibuka
  loadRecentFiles();

  // --- Terapkan batasan tipe file dari config.js ke UI secara otomatis ---
  applyAllowedTypesToUI();

  function applyAllowedTypesToUI() {
    const exts = CONFIG.ALLOWED_EXTENSIONS || [];

    if (exts.length === 0) {
      fileInput.removeAttribute("accept");
      document.getElementById("dzTitle").textContent = "Seret & lepas file di sini";
      document.getElementById("dzSub").textContent = "atau klik untuk memilih file dari perangkatmu";
      document.getElementById("tagline").textContent = "Unggah file, dapatkan link, bagikan ke siapa saja. Cepat dan tanpa ribet.";
      return;
    }

    fileInput.setAttribute("accept", exts.join(","));

    const labels = exts.map((e) => e.replace(".", "").toUpperCase());
    const readable = labels.length === 1
      ? labels[0]
      : labels.slice(0, -1).join(", ") + " atau " + labels[labels.length - 1];

    document.getElementById("dzTitle").textContent = `Seret & lepas file ${readable} di sini`;
    document.getElementById("dzSub").textContent = `atau klik untuk memilih file ${readable} dari perangkatmu`;
    document.getElementById("tagline").textContent = `Unggah file ${readable}, dapatkan link, bagikan ke siapa saja. Cepat dan tanpa ribet.`;
  }

  // --- Klik dropzone -> buka file picker ---
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });

  // --- Drag & drop ---
  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) selectFile(file);
  });

  // --- Pilih file via input ---
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) selectFile(fileInput.files[0]);
  });

  // --- Hapus file yang dipilih ---
  fRemove.addEventListener("click", (e) => {
    e.stopPropagation();
    resetFileSelection();
  });

  function selectFile(file) {
    if (!file || file.size === 0) {
      showToast("File kosong tidak dapat diunggah.", "error");
      return;
    }
    if (file.size > CONFIG.MAX_FILE_SIZE) {
      showToast(`Ukuran file melebihi batas maksimum (${formatBytes(CONFIG.MAX_FILE_SIZE)}).`, "error");
      return;
    }

    const exts = CONFIG.ALLOWED_EXTENSIONS || [];
    if (exts.length > 0) {
      const nameLower = file.name.toLowerCase();
      const isAllowedExt = exts.some((ext) => nameLower.endsWith(ext.toLowerCase()));
      if (!isAllowedExt) {
        showToast(`Tipe file tidak didukung. Hanya ${exts.join(", ")} yang diizinkan.`, "error");
        return;
      }
    }

    selectedFile = file;
    fName.textContent = file.name;
    fSize.textContent = formatBytes(file.size);
    fileInfo.classList.add("show");
    uploadBtn.disabled = false;
    uploadBtnText.textContent = "Unggah File";
  }

  function resetFileSelection() {
    selectedFile = null;
    fileInput.value = "";
    fileInfo.classList.remove("show");
    uploadBtn.disabled = true;
    uploadBtnText.textContent = "Pilih file dahulu";
    progressWrap.classList.remove("show");
    progressFill.style.width = "0%";
    progressFill.classList.remove("shimmer");
    progressPct.textContent = "0%";
  }

  // --- Proses upload ---
  uploadBtn.addEventListener("click", async () => {
    if (!selectedFile || isUploading) return;

    if (!navigator.onLine) {
      showToast("Tidak ada koneksi internet. Coba lagi nanti.", "error");
      return;
    }

    // --- Cooldown anti-spam klik berulang (proteksi ringan di sisi client) ---
    const cooldownMs = CONFIG.UPLOAD_COOLDOWN_MS || 0;
    const lastUpload = parseInt(localStorage.getItem("dropshare-last-upload") || "0", 10);
    const sinceLast = Date.now() - lastUpload;
    if (cooldownMs > 0 && sinceLast < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - sinceLast) / 1000);
      showToast(`Tunggu ${waitSec} detik sebelum mengunggah file lagi.`, "error");
      return;
    }

    isUploading = true;
    uploadBtn.disabled = true;
    fRemove.style.pointerEvents = "none";
    progressWrap.classList.add("show");
    progressLabel.textContent = "Uploading...";

    uploadBtnText.innerHTML = "";
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    uploadBtnText.appendChild(spinner);
    uploadBtnText.appendChild(document.createTextNode(" Mengunggah..."));

    // Progress bar palsu (Firestore write tidak punya event progress asli),
    // supaya UX tetap terasa responsif untuk file kecil.
    let fakePct = 0;
    const fakeProgress = setInterval(() => {
      fakePct = Math.min(fakePct + 15, 90);
      progressFill.style.width = fakePct + "%";
      progressPct.textContent = Math.round(fakePct) + "%";
    }, 120);

    try {
      const fileId = await uploadToFirestore(selectedFile, showInRecentToggle && showInRecentToggle.checked);

      clearInterval(fakeProgress);
      progressFill.style.width = "100%";
      progressPct.textContent = "100%";
      localStorage.setItem("dropshare-last-upload", String(Date.now()));

      const shareUrl = `${window.location.origin}${window.location.pathname.replace(/index\.html$/, "").replace(/\/$/, "")}/download.html?id=${encodeURIComponent(fileId)}`;
      resultLink.value = shareUrl;
      uploadForm.style.display = "none";
      resultView.classList.add("show");
      showToast("File berhasil diunggah!", "success");

      loadRecentFiles();

    } catch (err) {
      clearInterval(fakeProgress);
      console.error(err);
      showToast(err.message || "Gagal mengunggah file. Coba lagi.", "error");
      progressLabel.textContent = "Gagal mengunggah";
    } finally {
      isUploading = false;
      uploadBtn.disabled = false;
      fRemove.style.pointerEvents = "auto";
      uploadBtnText.textContent = "Unggah File";
    }
  });

  // --- Salin link ---
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(resultLink.value);
      showToast("Link disalin ke clipboard!", "success");
    } catch {
      resultLink.select();
      document.execCommand("copy");
      showToast("Link disalin!", "success");
    }
  });

  // --- Buka link ---
  openBtn.addEventListener("click", () => {
    window.open(resultLink.value, "_blank");
  });

  // --- Upload file lagi ---
  resetBtn.addEventListener("click", () => {
    resultView.classList.remove("show");
    uploadForm.style.display = "block";
    resetFileSelection();
  });
}

/* ==========================================================================
   FUNGSI: Baca file sebagai teks (Promise wrapper untuk FileReader)
   ========================================================================== */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Gagal membaca file."));
    reader.readAsText(file);
  });
}

/* ==========================================================================
   FUNGSI: Upload file ke Firestore.
   Isi file disimpan sebagai field string di dalam 1 dokumen. Firestore
   membatasi ukuran dokumen ~1MB, karena itu file divalidasi terhadap
   CONFIG.MAX_FILE_SIZE (jauh di bawah limit itu) sebelum dikirim.
   ========================================================================== */
async function uploadToFirestore(file, isPublic) {
  const content = await readFileAsText(file);

  // Validasi tambahan: pastikan isi file benar-benar JSON valid,
  // bukan cuma mengandalkan ekstensi nama file.
  try {
    JSON.parse(content);
  } catch (e) {
    throw new Error("Isi file bukan JSON yang valid.");
  }

  const docData = {
    name: file.name,
    content: content,
    size: file.size,
    type: file.type || "application/json",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    public: !!isPublic
  };

  try {
    const ref = await db.collection(CONFIG.FILES_COLLECTION).add(docData);
    return ref.id;
  } catch (err) {
    console.error(err);
    if (err.code === "permission-denied") {
      throw new Error("Upload ditolak oleh aturan keamanan (cek Firestore Rules / App Check).");
    }
    throw new Error("Upload gagal. Periksa koneksi atau konfigurasi Firebase.");
  }
}

/* ==========================================================================
   HALAMAN DOWNLOAD (download.html)
   Alur:
   1. Ambil parameter ?id=
   2. Ambil dokumen dari Firestore berdasarkan id tsb
   3. Bentuk file Blob dari isi dokumen -> trigger auto-download
   4. Tampilkan error yang jelas jika gagal / offline
   ========================================================================== */
async function initDownloadPage() {
  const dlLoading      = document.getElementById("dlLoading");
  const dlReady        = document.getElementById("dlReady");
  const dlReadyIcon    = document.getElementById("dlReadyIcon");
  const dlFileName     = document.getElementById("dlFileName");
  const dlFileSize     = document.getElementById("dlFileSize");
  const dlFileDate     = document.getElementById("dlFileDate");
  const dlReadyStatus  = document.getElementById("dlReadyStatus");
  const dlReadySpinner = document.getElementById("dlReadySpinner");
  const dlManualWrap   = document.getElementById("dlManualWrap");
  const dlManualBtn    = document.getElementById("dlManualBtn");
  const dlError        = document.getElementById("dlError");
  const dlErrorMsg     = document.getElementById("dlErrorMsg");

  const params = new URLSearchParams(window.location.search);
  const fileId = params.get("id");

  if (!fileId) {
    return showError("Link tidak valid. Parameter id tidak ditemukan.");
  }

  if (!navigator.onLine) {
    return showError("Tidak ada koneksi internet. Periksa jaringanmu dan coba lagi.");
  }

  let objectUrl = null;

  try {
    const snap = await db.collection(CONFIG.FILES_COLLECTION).doc(fileId).get();

    if (!snap.exists) {
      return showError("File tidak ditemukan. Link mungkin sudah kedaluwarsa atau dihapus.");
    }

    const data = snap.data();
    const fileName = data.name || `${fileId}.json`;
    const fileSize = typeof data.size === "number" ? data.size : new Blob([data.content || ""]).size;
    const createdAt = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() : null;

    const blob = new Blob([data.content || ""], { type: data.type || "application/json" });
    objectUrl = URL.createObjectURL(blob);

    dlFileName.textContent = fileName;
    dlFileSize.textContent = formatBytes(fileSize);
    dlFileDate.textContent = createdAt ? formatUploadDate(createdAt) : "Tanggal tidak diketahui";

    dlLoading.style.display = "none";
    dlReady.style.display = "block";
    dlReadyStatus.textContent = "Menyiapkan unduhan...";

    await new Promise((resolve) => setTimeout(resolve, 1100));

    triggerDownload(objectUrl, fileName);

    dlReadySpinner.style.display = "none";
    dlReadyStatus.textContent = "Unduhan dimulai. Jika tidak berjalan otomatis, klik tombol di bawah.";
    dlReadyIcon.outerHTML = '<svg id="dlReadyIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    dlManualWrap.style.display = "block";

    dlManualBtn.addEventListener("click", () => triggerDownload(objectUrl, fileName));

  } catch (err) {
    console.error(err);
    if (err.code === "permission-denied") {
      showError("Akses ditolak oleh aturan keamanan Firestore.");
    } else {
      showError("Terjadi kesalahan saat menyiapkan file. Coba lagi nanti.");
    }
  }

  function triggerDownload(url, name) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function showError(message) {
    dlLoading.style.display = "none";
    dlReady.style.display = "none";
    dlError.classList.add("show");
    dlErrorMsg.textContent = message;
    showToast(message, "error");
  }
}

/* ==========================================================================
   FUNGSI: Muat & tampilkan file terbaru yang diunggah (publik, opt-in
   lewat toggle privasi). Data diambil dari Firestore, field `public == true`.
   Kalau collection kosong, kartu "File Terbaru" otomatis disembunyikan.
   ========================================================================== */
async function loadRecentFiles() {
  const sectionEl = document.getElementById("recentFilesSection");
  const listEl = document.getElementById("recentFilesList");
  if (!sectionEl || !listEl) return;

  try {
    const snap = await db.collection(CONFIG.FILES_COLLECTION)
      .where("public", "==", true)
      .orderBy("createdAt", "desc")
      .limit(CONFIG.RECENT_UPLOADS_LIMIT || 15)
      .get();

    if (snap.empty) {
      sectionEl.style.display = "none";
      return;
    }

    const basePath = window.location.pathname.replace(/index\.html$/, "").replace(/\/$/, "");
    listEl.innerHTML = "";

    snap.forEach((doc) => {
      const row = doc.data();
      const a = document.createElement("a");
      a.className = "recent-item";
      a.href = `${basePath}/download.html?id=${encodeURIComponent(doc.id)}`;

      const icon = document.createElement("div");
      icon.className = "recent-icon";
      icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>';

      const meta = document.createElement("div");
      meta.className = "recent-meta";
      const nameEl = document.createElement("div");
      nameEl.className = "recent-name";
      nameEl.textContent = row.name;
      const subEl = document.createElement("div");
      subEl.className = "recent-sub";
      const createdAt = row.createdAt && row.createdAt.toDate ? row.createdAt.toDate() : null;
      subEl.textContent = `${formatBytes(row.size || 0)} · ${createdAt ? formatRelativeTime(createdAt) : "-"}`;
      meta.appendChild(nameEl);
      meta.appendChild(subEl);

      const arrow = document.createElement("div");
      arrow.className = "recent-arrow";
      arrow.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

      a.appendChild(icon);
      a.appendChild(meta);
      a.appendChild(arrow);
      listEl.appendChild(a);
    });

    sectionEl.style.display = "block";
  } catch (err) {
    console.error("Gagal memuat file terbaru:", err);
    sectionEl.style.display = "none";
  }
}

/* ==========================================================================
   UTIL: Format waktu relatif (mis. "5 menit lalu") dari objek Date
   ========================================================================== */
function formatRelativeTime(date) {
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "Baru saja";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} menit lalu`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} jam lalu`;
  return `${Math.floor(diffSec / 86400)} hari lalu`;
}

/* ==========================================================================
   UTIL: Format tanggal upload (dari objek Date) ke format Indonesia
   ========================================================================== */
function formatUploadDate(date) {
  try {
    return date.toLocaleDateString("id-ID", {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return "Tanggal tidak diketahui";
  }
}
