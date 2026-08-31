/* ==========================================================================
   CONFIG.JS
   Satu-satunya file yang perlu kamu ubah.
   Isi SUPABASE_URL & SUPABASE_ANON_KEY dari project Supabase kamu.
   JANGAN PERNAH memakai Service Role Key di sini — hanya Anon/Public Key.
   ========================================================================== */
const CONFIG = {
  SUPABASE_URL: "https://iofafbpczagpdpiufxxz.supabase.co", // URL project Supabase
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvZmFmYnBjemFncGRwaXVmeHh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMjQwMzgsImV4cCI6MjEwMDkwMDAzOH0.GEuFVUtv7XRiDFKWY-6US8kb59swcYr9o_JDS-C3i4c",             // Anon/public key (aman untuk frontend)
  STORAGE_BUCKET: "uploads",                             // Nama bucket Storage (harus public)
  MAX_FILE_SIZE: 100 * 1024 * 1024,                       // Ukuran file maksimum (default 100MB) dalam byte
  ALLOWED_EXTENSIONS: [".json", ".mp3", ".mp4", ".fbx"],                          // Ekstensi file yang diizinkan diunggah (ubah di sini kalau perlu tipe lain)

  // Tabel Supabase Database untuk fitur "File Terbaru" di halaman utama.
  // Lihat panduan setup tabel & RLS policy di pesan penjelasan.
  RECENT_UPLOADS_TABLE: "recent_uploads",
  RECENT_UPLOADS_LIMIT: 5
};
