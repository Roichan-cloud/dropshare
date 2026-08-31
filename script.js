/* ==========================================================================
   SCRIPT.JS
   Logic untuk index.html (upload) dan download.html (download).
   File ini otomatis mendeteksi ada di halaman mana lewat elemen yang tersedia.
   Membutuhkan config.js dan Supabase JS SDK dimuat SEBELUM file ini.
   ========================================================================== */

/* --- Init Supabase client (dari UMD bundle supabase-js) --- */
const { createClient } = supabase;
const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

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
      // Tidak ada pembatasan -> terima semua jenis file
      fileInput.removeAttribute("accept");
      document.getElementById("dzTitle").textContent = "Seret & lepas file di sini";
      document.getElementById("dzSub").textContent = "atau klik untuk memilih file dari perangkatmu";
      document.getElementById("tagline").textContent = "Unggah file, dapatkan link, bagikan ke siapa saja. Cepat dan tanpa ribet.";
      return;
    }

    // accept="" dipakai browser untuk memfilter file picker (mis. ".json,.pdf,.csv")
    fileInput.setAttribute("accept", exts.join(","));

    // Label yang ramah dibaca, mis. ".json" -> "JSON", digabung jadi "JSON, PDF, atau CSV"
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
    // Validasi: file kosong
    if (!file || file.size === 0) {
      showToast("File kosong tidak dapat diunggah.", "error");
      return;
    }
    // Validasi: ukuran maksimum dari config.js
    if (file.size > CONFIG.MAX_FILE_SIZE) {
      showToast(`Ukuran file melebihi batas maksimum (${formatBytes(CONFIG.MAX_FILE_SIZE)}).`, "error");
      return;
    }

    // Validasi: hanya ekstensi tertentu yang diizinkan (diatur di config.js)
    // Array kosong berarti semua tipe file diizinkan.
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
    fName.textContent = file.name; // textContent, aman dari XSS
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

    try {
      const fileId = await uploadToSupabase(selectedFile, (pct) => {
        progressFill.style.width = pct + "%";
        progressPct.textContent = Math.round(pct) + "%";
        progressFill.classList.toggle("shimmer", pct >= 90);
      });

      // Link yang dibagikan mengarah ke download.html. Path penyimpanan file di
      // storage TETAP memakai id acak (bukan nama asli), namun nama file asli
      // disertakan sebagai parameter terpisah agar saat diunduh, nama filenya
      // sama seperti yang diunggah pengguna.
      const shareUrl = `${window.location.origin}${window.location.pathname.replace(/index\.html$/, "").replace(/\/$/, "")}/download.html?id=${encodeURIComponent(fileId)}&name=${encodeURIComponent(selectedFile.name)}`;
      resultLink.value = shareUrl;
      uploadForm.style.display = "none";
      resultView.classList.add("show");
      showToast("File berhasil diunggah!", "success");

      // Kalau toggle privasi aktif, catat file ini ke daftar "File Terbaru"
      // publik. Kalau gagal (mis. tabel belum disiapkan di Supabase), jangan
      // sampai mengganggu proses upload utama -> cukup diabaikan saja.
      if (showInRecentToggle && showInRecentToggle.checked) {
        try {
          await sb.from(CONFIG.RECENT_UPLOADS_TABLE).insert({
            file_id: fileId,
            file_name: selectedFile.name,
            file_size: selectedFile.size
          });
        } catch (err) {
          console.error("Gagal mencatat ke file terbaru:", err);
        }
      }
      loadRecentFiles();

    } catch (err) {
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
   FUNGSI: Upload file ke Supabase Storage dengan progress realtime.
   Supabase-js tidak menyediakan event progress bawaan, jadi kita panggil
   REST endpoint Storage API secara langsung lewat XMLHttpRequest agar bisa
   memantau xhr.upload.onprogress.
   ========================================================================== */
async function uploadToSupabase(file, onProgress) {
  // Buat nama file acak (UUID) supaya tidak bentrok & tidak membocorkan nama asli
  const ext = file.name.includes(".") ? "." + file.name.split(".").pop().replace(/[^a-zA-Z0-9]/g, "") : "";
  const fileId = crypto.randomUUID() + ext;

  const uploadUrl = `${CONFIG.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(CONFIG.STORAGE_BUCKET)}/${encodeURIComponent(fileId)}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl, true);
    xhr.setRequestHeader("Authorization", `Bearer ${CONFIG.SUPABASE_ANON_KEY}`);
    xhr.setRequestHeader("apikey", CONFIG.SUPABASE_ANON_KEY);
    xhr.setRequestHeader("x-upsert", "false"); // hindari overwrite file yang sudah ada
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("cache-control", "3600");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve(fileId);
      } else {
        let msg = "Upload gagal. Periksa konfigurasi Supabase atau koneksimu.";
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed.message) msg = parsed.message;
        } catch (_) { /* biarkan pesan default */ }
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => reject(new Error("Koneksi terputus saat mengunggah. Coba lagi."));
    xhr.onabort = () => reject(new Error("Upload dibatalkan."));

    xhr.send(file);
  });
}

/* ==========================================================================
   HALAMAN DOWNLOAD (download.html)
   Alur:
   1. Ambil parameter ?id=
   2. Bentuk public URL dari Supabase Storage
   3. Cek file ada (HEAD request) -> jika ok, trigger auto-download
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
  const originalName = params.get("name"); // nama file asli (opsional, untuk penamaan saat unduh)

  if (!fileId) {
    return showError("Link tidak valid. Parameter id tidak ditemukan.");
  }

  if (!navigator.onLine) {
    return showError("Tidak ada koneksi internet. Periksa jaringanmu dan coba lagi.");
  }

  try {
    // Ambil public URL dari Supabase Storage. Opsi "download" dengan nilai
    // string akan membuat browser menyimpan file dengan nama tersebut
    // (sama seperti nama asli saat diunggah), bukan nama UUID di storage.
    const { data } = sb.storage
      .from(CONFIG.STORAGE_BUCKET)
      .getPublicUrl(fileId, { download: originalName || true });

    const publicUrl = data && data.publicUrl;
    if (!publicUrl) throw new Error("Tidak dapat membentuk URL file.");

    // Cek dulu apakah file benar-benar ada, sekaligus ambil info ukuran &
    // tanggal upload dari response header (Content-Length, Last-Modified),
    // agar tidak menampilkan halaman error mentah dari Supabase.
    const check = await fetch(publicUrl, { method: "HEAD" }).catch(() => null);
    if (!check || !check.ok) {
      return showError("File tidak ditemukan. Link mungkin sudah kedaluwarsa atau dihapus.");
    }

    const sizeHeader = check.headers.get("content-length");
    const dateHeader = check.headers.get("last-modified");

    // Tampilkan kartu info file SEBELUM unduhan benar-benar dimulai
    dlFileName.textContent = originalName || fileId;
    dlFileSize.textContent = sizeHeader ? formatBytes(parseInt(sizeHeader, 10)) : "Ukuran tidak diketahui";
    dlFileDate.textContent = dateHeader ? formatUploadDate(dateHeader) : "Tanggal tidak diketahui";

    dlLoading.style.display = "none";
    dlReady.style.display = "block";
    dlReadyStatus.textContent = "Menyiapkan unduhan...";

    // Beri jeda sebentar supaya pengguna sempat melihat info file sebelum
    // browser mulai mengunduh.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    triggerDownload(publicUrl);

    // Update tampilan jadi status "selesai memicu unduhan"
    dlReadySpinner.style.display = "none";
    dlReadyStatus.textContent = "Unduhan dimulai. Jika tidak berjalan otomatis, klik tombol di bawah.";
    dlReadyIcon.outerHTML = '<svg id="dlReadyIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    dlManualWrap.style.display = "block";

    dlManualBtn.addEventListener("click", () => triggerDownload(publicUrl));

  } catch (err) {
    console.error(err);
    showError("Terjadi kesalahan saat menyiapkan file. Coba lagi nanti.");
  }

  function triggerDownload(url) {
    const a = document.createElement("a");
    a.href = url;
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
   FUNGSI: Muat & tampilkan 5 file terbaru yang diunggah (publik, opt-in
   lewat toggle privasi). Data diambil dari tabel Supabase Database
   CONFIG.RECENT_UPLOADS_TABLE. Kalau tabel belum disiapkan atau kosong,
   kartu "File Terbaru" otomatis disembunyikan tanpa error yang mengganggu.
   ========================================================================== */
async function loadRecentFiles() {
  const sectionEl = document.getElementById("recentFilesSection");
  const listEl = document.getElementById("recentFilesList");
  if (!sectionEl || !listEl) return;

  try {
    const { data, error } = await sb
      .from(CONFIG.RECENT_UPLOADS_TABLE)
      .select("file_id, file_name, file_size, created_at")
      .order("created_at", { ascending: false })
      .limit(CONFIG.RECENT_UPLOADS_LIMIT || 5);

    if (error || !data || data.length === 0) {
      sectionEl.style.display = "none";
      return;
    }

    const basePath = window.location.pathname.replace(/index\.html$/, "").replace(/\/$/, "");
    listEl.innerHTML = ""; // kosongkan sebelum render ulang

    data.forEach((row) => {
      const a = document.createElement("a");
      a.className = "recent-item";
      a.href = `${basePath}/download.html?id=${encodeURIComponent(row.file_id)}&name=${encodeURIComponent(row.file_name)}`;

      const icon = document.createElement("div");
      icon.className = "recent-icon";
      icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>';

      const meta = document.createElement("div");
      meta.className = "recent-meta";
      const nameEl = document.createElement("div");
      nameEl.className = "recent-name";
      nameEl.textContent = row.file_name; // textContent -> aman dari XSS
      const subEl = document.createElement("div");
      subEl.className = "recent-sub";
      subEl.textContent = `${formatBytes(row.file_size || 0)} · ${formatRelativeTime(row.created_at)}`;
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
   UTIL: Format waktu relatif (mis. "5 menit lalu") dari timestamp ISO
   ========================================================================== */
function formatRelativeTime(isoStr) {
  const diffSec = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diffSec < 60) return "Baru saja";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} menit lalu`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} jam lalu`;
  return `${Math.floor(diffSec / 86400)} hari lalu`;
}

/* ==========================================================================
   UTIL: Format tanggal upload (dari header Last-Modified) ke format Indonesia
   ========================================================================== */
function formatUploadDate(httpDateStr) {
  try {
    const d = new Date(httpDateStr);
    return d.toLocaleDateString("id-ID", {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return "Tanggal tidak diketahui";
  }
}
