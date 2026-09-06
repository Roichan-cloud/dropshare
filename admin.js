/* ==========================================================================
   ADMIN.JS
   Logic untuk admin.html. Terpisah dari script.js supaya tidak saling
   tabrakan (init Firebase App cuma boleh dipanggil sekali per halaman).
   Membutuhkan config.js dan Firebase SDK (app, firestore, auth - compat
   build) dimuat SEBELUM file ini.
   ========================================================================== */

firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
const db = firebase.firestore();
const auth = firebase.auth();

/* --- Elemen-elemen halaman --- */
const loginView     = document.getElementById("loginView");
const deniedView    = document.getElementById("deniedView");
const dashboardView = document.getElementById("dashboardView");
const deniedEmail   = document.getElementById("deniedEmail");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const logoutBtn      = document.getElementById("logoutBtn");
const logoutDeniedBtn = document.getElementById("logoutDeniedBtn");
const adminAvatar = document.getElementById("adminAvatar");
const adminEmail  = document.getElementById("adminEmail");

const statTotal   = document.getElementById("statTotal");
const statSize    = document.getElementById("statSize");
const statPublic  = document.getElementById("statPublic");
const statPrivate = document.getElementById("statPrivate");

const searchInput  = document.getElementById("searchInput");
const refreshBtn   = document.getElementById("refreshBtn");
const deleteAllBtn = document.getElementById("deleteAllBtn");
const fileListWrap = document.getElementById("fileListWrap");

let allFiles = []; // cache hasil fetch, dipakai untuk search & render ulang tanpa fetch lagi

/* ==========================================================================
   THEME SWITCHER
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
   UTIL: Toast
   ========================================================================== */
function showToast(message, type = "info") {
  const wrap = document.getElementById("toastWrap");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  const dot = document.createElement("span");
  dot.className = "dot";
  const text = document.createElement("span");
  text.textContent = message;
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
   UTIL: Format ukuran & tanggal
   ========================================================================== */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
function formatDate(date) {
  if (!date) return "-";
  try {
    return date.toLocaleDateString("id-ID", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
  } catch { return "-"; }
}

/* ==========================================================================
   AUTH: Login / Logout / Gate berdasarkan ADMIN_EMAIL
   ========================================================================== */
googleLoginBtn.addEventListener("click", async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (err) {
    console.error(err);
    if (err.code === "auth/unauthorized-domain") {
      showToast("Domain ini belum diizinkan di Firebase Authentication > Settings > Authorized domains.", "error");
    } else if (err.code !== "auth/popup-closed-by-user") {
      showToast("Gagal login: " + (err.message || "coba lagi."), "error");
    }
  }
});

logoutBtn.addEventListener("click", () => auth.signOut());
logoutDeniedBtn.addEventListener("click", () => auth.signOut());

auth.onAuthStateChanged(async (user) => {
  loginView.style.display = "none";
  deniedView.style.display = "none";
  dashboardView.style.display = "none";

  if (!user) {
    loginView.style.display = "block";
    return;
  }

  // Tidak ada pengecekan email di sisi client. Kita langsung coba ambil
  // data admin (query tanpa filter public) - Firestore Rules yang akan
  // menolak (permission-denied) kalau email ini bukan admin yang terdaftar
  // di Rules. Dengan begini, email admin tidak perlu ditulis di kode publik.
  adminEmail.textContent = user.email;
  adminAvatar.src = user.photoURL || "";

  try {
    await loadAllFiles(true); // true = lempar error kalau gagal, dipakai untuk deteksi akses
    dashboardView.style.display = "flex";
  } catch (err) {
    if (err && err.code === "permission-denied") {
      deniedEmail.textContent = user.email || "(tanpa email)";
      deniedView.style.display = "block";
    } else {
      console.error(err);
      showToast("Terjadi kesalahan saat memeriksa akses.", "error");
      deniedEmail.textContent = user.email || "(tanpa email)";
      deniedView.style.display = "block";
    }
  }
});

/* ==========================================================================
   FUNGSI: Muat semua file dari Firestore (termasuk yang privat)
   ========================================================================== */
async function loadAllFiles(throwOnError) {
  fileListWrap.innerHTML = '<div class="loading-state"><span class="spinner" style="color:var(--accent);"></span> Memuat data file...</div>';
  try {
    const snap = await db.collection(CONFIG.FILES_COLLECTION).orderBy("createdAt", "desc").get();
    allFiles = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        name: d.name || "(tanpa nama)",
        size: typeof d.size === "number" ? d.size : 0,
        public: !!d.public,
        createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate() : null
      };
    });
    renderStats();
    renderList(allFiles);
  } catch (err) {
    if (throwOnError) throw err; // dilempar ke pemanggil (auth gate) untuk deteksi permission-denied
    console.error(err);
    fileListWrap.innerHTML = '<div class="empty-state">Gagal memuat data. Cek Firestore Rules / koneksi.</div>';
    showToast("Gagal memuat data file.", "error");
  }
}

refreshBtn.addEventListener("click", loadAllFiles);

searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  const filtered = q ? allFiles.filter((f) => f.name.toLowerCase().includes(q)) : allFiles;
  renderList(filtered);
});

/* ==========================================================================
   FUNGSI: Render statistik
   ========================================================================== */
function renderStats() {
  const total = allFiles.length;
  const totalSize = allFiles.reduce((sum, f) => sum + (f.size || 0), 0);
  const publicCount = allFiles.filter((f) => f.public).length;

  statTotal.textContent = total;
  statSize.textContent = formatBytes(totalSize);
  statPublic.textContent = publicCount;
  statPrivate.textContent = total - publicCount;
}

/* ==========================================================================
   FUNGSI: Render daftar file
   ========================================================================== */
function renderList(files) {
  if (files.length === 0) {
    fileListWrap.innerHTML = '<div class="empty-state">Belum ada file, atau tidak ada yang cocok dengan pencarian.</div>';
    return;
  }

  fileListWrap.innerHTML = "";
  files.forEach((f) => {
    const row = document.createElement("div");
    row.className = "file-row";

    const icon = document.createElement("div");
    icon.className = "f-icon";
    icon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>';

    const meta = document.createElement("div");
    meta.className = "f-meta";
    const nameEl = document.createElement("div");
    nameEl.className = "f-name";
    nameEl.textContent = f.name;
    const subEl = document.createElement("div");
    subEl.className = "f-sub";

    const badge = document.createElement("span");
    badge.className = "badge " + (f.public ? "public" : "private");
    badge.textContent = f.public ? "Publik" : "Privat";

    subEl.appendChild(badge);
    subEl.appendChild(document.createTextNode(`${formatBytes(f.size)} · ${formatDate(f.createdAt)}`));

    meta.appendChild(nameEl);
    meta.appendChild(subEl);

    const actions = document.createElement("div");
    actions.className = "f-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "icon-btn copy-btn";
    copyBtn.title = "Salin link";
    copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    copyBtn.addEventListener("click", async () => {
      const url = `${window.location.origin}${window.location.pathname.replace(/admin\.html$/, "")}download.html?id=${encodeURIComponent(f.id)}`;
      try {
        await navigator.clipboard.writeText(url);
        showToast("Link disalin!", "success");
      } catch {
        showToast("Gagal menyalin link.", "error");
      }
    });

    const delBtn = document.createElement("button");
    delBtn.className = "icon-btn";
    delBtn.title = "Hapus file";
    delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>';
    delBtn.addEventListener("click", () => deleteOneFile(f.id, f.name, row));

    actions.appendChild(copyBtn);
    actions.appendChild(delBtn);

    row.appendChild(icon);
    row.appendChild(meta);
    row.appendChild(actions);
    fileListWrap.appendChild(row);
  });
}

/* ==========================================================================
   FUNGSI: Hapus 1 file
   ========================================================================== */
async function deleteOneFile(id, name, rowEl) {
  const confirmed = window.confirm(`Hapus file "${name}"? Tindakan ini tidak bisa dibatalkan.`);
  if (!confirmed) return;

  try {
    await db.collection(CONFIG.FILES_COLLECTION).doc(id).delete();
    allFiles = allFiles.filter((f) => f.id !== id);
    renderStats();
    if (rowEl) rowEl.remove();
    if (allFiles.length === 0) renderList([]);
    showToast("File berhasil dihapus.", "success");
  } catch (err) {
    console.error(err);
    if (err.code === "permission-denied") {
      showToast("Gagal hapus: ditolak Firestore Rules (cek ADMIN_EMAIL di rules).", "error");
    } else {
      showToast("Gagal menghapus file.", "error");
    }
  }
}

/* ==========================================================================
   FUNGSI: Hapus SEMUA file (bersihkan quota). Pakai batched writes karena
   Firestore membatasi maksimum 500 operasi per batch.
   ========================================================================== */
deleteAllBtn.addEventListener("click", async () => {
  if (allFiles.length === 0) {
    showToast("Tidak ada file untuk dihapus.", "info");
    return;
  }

  const confirmed = window.confirm(
    `Yakin ingin menghapus SEMUA ${allFiles.length} file? Tindakan ini PERMANEN dan tidak bisa dibatalkan.`
  );
  if (!confirmed) return;

  const doubleCheck = window.prompt('Ketik "HAPUS" (huruf besar) untuk konfirmasi terakhir:');
  if (doubleCheck !== "HAPUS") {
    showToast("Dibatalkan.", "info");
    return;
  }

  deleteAllBtn.disabled = true;
  deleteAllBtn.innerHTML = '<span class="spinner"></span> Menghapus...';

  try {
    const ids = allFiles.map((f) => f.id);
    const chunkSize = 450; // aman di bawah limit 500 operasi/batch Firestore
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const batch = db.batch();
      chunk.forEach((id) => batch.delete(db.collection(CONFIG.FILES_COLLECTION).doc(id)));
      await batch.commit();
    }

    allFiles = [];
    renderStats();
    renderList([]);
    showToast("Semua file berhasil dihapus. Quota Firestore sudah dibersihkan.", "success");
  } catch (err) {
    console.error(err);
    showToast("Gagal menghapus semua file. Coba lagi atau hapus bertahap.", "error");
  } finally {
    deleteAllBtn.disabled = false;
    deleteAllBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg> Hapus Semua';
  }
});
