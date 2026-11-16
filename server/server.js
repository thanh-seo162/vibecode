/* ==========================================================================
   Server tĩnh nhỏ cho game Đập Chuột — chỉ dùng module có sẵn của Node.js.
   - /            → thư mục app/      (index.html, style.css, game.js…)
   - /design/...  → thư mục design/   (app/style.css nạp ../design/tokens.css)
   ========================================================================== */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = path.resolve(process.env.SITE_ROOT || path.join(__dirname, ".."));
const APP_DIR = path.join(ROOT, "app");
const DESIGN_DIR = path.join(ROOT, "design");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

/** Đổi đường dẫn URL thành file trên đĩa; trả về null nếu ra ngoài thư mục được phép. */
function resolveFile(urlPath) {
  let base = APP_DIR;
  let rel = urlPath;
  if (rel === "/design" || rel.startsWith("/design/")) {
    base = DESIGN_DIR;
    rel = rel.slice("/design".length);
  }
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  const file = path.resolve(base, "." + rel);
  if (file !== base && !file.startsWith(base + path.sep)) return null;
  return file;
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const started = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`);
  });

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return send(res, 405, "Method Not Allowed");
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch (e) {
    return send(res, 400, "Bad Request");
  }
  if (urlPath === "/healthz") return send(res, 200, "ok");

  const file = resolveFile(urlPath);
  if (!file) return send(res, 403, "Forbidden");

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, "Not Found");
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff"
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Đập Chuột đang chạy tại http://localhost:${PORT} (phục vụ ${APP_DIR})`);
});

// Docker gửi SIGTERM khi dừng container: đóng server gọn gàng.
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log(`Nhận ${sig}, đang dừng server…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
