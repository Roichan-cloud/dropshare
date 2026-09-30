/* ==========================================================================
   SW.JS — Service Worker DropShare
   Tugas utama: menangkap file yang dikirim lewat "Bagikan" (Share Target API)
   dari aplikasi lain (WhatsApp, dll), lalu meneruskannya ke share.html.

   Kenapa perlu service worker untuk ini? Karena share sheet Android mengirim
   file lewat HTTP POST, sedangkan GitHub Pages adalah hosting statis yang
   tidak bisa memproses POST di server. Service worker "mencegat" POST itu
   di sisi browser, menyimpan filenya sementara, lalu mengarahkan (redirect)
   ke share.html sebagai GET biasa yang bisa dibaca situs statis.
   ========================================================================== */

const SHARE_CACHE = "dropshare-share-target-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Hanya tangani POST yang menuju share.html (dikirim dari share sheet)
  if (event.request.method === "POST" && url.pathname.endsWith("/share.html")) {
    event.respondWith(handleShareTarget(event));
    return;
  }

  // Request lain dibiarkan berjalan normal (network passthrough)
});

async function handleShareTarget(event) {
  const cache = await caches.open(SHARE_CACHE);

  try {
    const formData = await event.request.clone().formData();

    const keys = [];
    for (const key of formData.keys()) keys.push(key);
    const file = formData.get("file");
    const titleVal = formData.get("title");
    const textVal = formData.get("text");

    // Catat apa yang benar-benar diterima, supaya bisa dilihat di layar
    // share.html tanpa perlu laptop/USB debugging.
    await cache.put("debug-log", new Response(JSON.stringify({
      timestamp: new Date().toISOString(),
      formDataKeys: keys,
      hasFile: !!file,
      fileName: file ? file.name : null,
      fileSize: file ? file.size : null,
      fileType: file ? file.type : null,
      titleValue: typeof titleVal === "string" ? titleVal : null,
      textValue: typeof textVal === "string" ? textVal : null
    }), { headers: { "Content-Type": "application/json" } }));

    if (file) {
      const fileResponse = new Response(file, {
        headers: {
          "Content-Type": file.type || "application/json",
          "X-File-Name": encodeURIComponent(file.name || "shared.json")
        }
      });
      await cache.put("shared-file", fileResponse);
    }

    // Redirect ke GET share.html?from-share=1 supaya browser melakukan
    // navigasi normal (halaman statis biasa) setelah POST selesai diproses.
    return Response.redirect("./share.html?from-share=1", 303);
  } catch (err) {
    try {
      await cache.put("debug-log", new Response(JSON.stringify({
        timestamp: new Date().toISOString(),
        error: err.message,
        stack: err.stack
      }), { headers: { "Content-Type": "application/json" } }));
    } catch (e2) { /* abaikan */ }
    return Response.redirect("./share.html?from-share=error", 303);
  }
}
