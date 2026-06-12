const DB_NAME = "PsychoPyWebFS";
const STORE_NAME = "files";
const WEBFS_PREFIX = "/webfs/";

function normalizeWebPath(file = "") {
  file = String(file || "").replaceAll("\\", "/").trim();
  if (file.startsWith(WEBFS_PREFIX)) file = file.slice(WEBFS_PREFIX.length);
  if (file.startsWith("/webfs/")) file = file.slice("/webfs/".length);
  if (file.startsWith("/")) file = file.slice(1);
  return file.split("/").filter((part) => part && part !== "." && part !== "..").join("/");
}

function mimeFor(key) {
  const ext = key.split(".").pop()?.toLowerCase();
  return {
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",
    js: "text/javascript; charset=utf-8",
    mjs: "text/javascript; charset=utf-8",
    css: "text/css; charset=utf-8",
    json: "application/json; charset=utf-8",
    psyexp: "application/xml; charset=utf-8",
    xml: "application/xml; charset=utf-8",
    txt: "text/plain; charset=utf-8",
    csv: "text/csv; charset=utf-8",
    tsv: "text/tab-separated-values; charset=utf-8",
    zip: "application/zip",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    wav: "audio/wav",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    webm: "video/webm",
  }[ext] || "application/octet-stream";
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readFile(key) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const request = tx.objectStore(STORE_NAME).get(key);
  return await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith(WEBFS_PREFIX)) return;
  event.respondWith((async () => {
    const key = normalizeWebPath(url.pathname);
    const content = await readFile(key);
    if (content === undefined) {
      return new Response(`WebFS file not found: ${key}`, {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return new Response(content, {
      headers: {
        "Content-Type": mimeFor(key),
        "Cache-Control": "no-store",
      },
    });
  })());
});
