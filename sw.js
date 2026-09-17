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
  try {
    const formData = await event.request.clone().formData();
    const file = formData.get("file");

    if (file) {
      const cache = await caches.open(SHARE_CACHE);
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
    return Response.redirect("./share.html?from-share=error", 303);
  }
}
