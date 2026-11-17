/* ==========================================================================
   Server game Đập Chuột — Node.js + PostgreSQL.
   - /             → thư mục app/      (game; /admin → app/admin/)
   - /design/...   → thư mục design/
   - /api/...      → API đăng ký, gửi điểm, quản trị (docs/04 › API)
   - /healthz      → "ok" khi kết nối được database
   ========================================================================== */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const V = require("../app/validate.js");
const U = require("./lib/util.js");
const db = require("./lib/db.js");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = path.resolve(process.env.SITE_ROOT || path.join(__dirname, ".."));
const APP_DIR = path.join(ROOT, "app");
const DESIGN_DIR = path.join(ROOT, "design");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_ENABLED = ADMIN_PASSWORD.length >= 12;
const COOKIE_SECURE = process.env.COOKIE_SECURE === "1";
const TRUST_PROXY = process.env.TRUST_PROXY === "1";

const BODY_MAX = 10 * 1024;
const SESSION_MS = 8 * 60 * 60 * 1000;
const COOKIE_NAME = "dc_admin";
const BULK_MAX = 100;

const registerLimiter = U.createRateLimiter(10, 60 * 1000);
const scoreLimiter = U.createRateLimiter(30, 60 * 1000);
const loginGuard = U.createLoginGuard(5, 15 * 60 * 1000);
const sessions = new Map(); // mã phiên → { username, expiresAt }

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

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY"
};

// ---------- Tiện ích phản hồi ----------
class HttpError extends Error {
  constructor(status, code, extra) { super(code); this.status = status; this.code = code; this.extra = extra; }
}

function sendText(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

function sendJson(res, status, obj, headers) {
  if (status === 204) { res.writeHead(204, headers || {}); return res.end(); }
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  }, headers || {}));
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const len = Number(req.headers["content-length"] || 0);
    if (len > BODY_MAX) return reject(new HttpError(413, "body_too_large"));
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > BODY_MAX) { reject(new HttpError(413, "body_too_large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) return resolve({});
      try {
        const v = JSON.parse(text);
        if (v === null || typeof v !== "object" || Array.isArray(v)) throw new Error("not object");
        resolve(v);
      } catch (e) { reject(new HttpError(400, "bad_json")); }
    });
    req.on("error", reject);
  });
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (xff) return xff;
  }
  return req.socket.remoteAddress || "unknown";
}

// ---------- Phiên quản trị ----------
function getSession(req) {
  const id = U.parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!id) return null;
  const s = sessions.get(id);
  if (!s) return null;
  if (s.expiresAt <= Date.now()) { sessions.delete(id); return null; }
  return { id, ...s };
}

function sessionCookie(value, maxAge) {
  return `${COOKIE_NAME}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}` +
    (COOKIE_SECURE ? "; Secure" : "");
}

setInterval(() => {
  const t = Date.now();
  for (const [k, s] of sessions) if (s.expiresAt <= t) sessions.delete(k);
}, 10 * 60 * 1000).unref();

/** Chống CSRF: POST/DELETE quản trị phải có Origin trùng với server. */
function checkOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch (e) { return false; }
}

function requireAdmin(req) {
  if (!ADMIN_ENABLED) throw new HttpError(503, "admin_disabled");
  const s = getSession(req);
  if (!s) throw new HttpError(401, "unauthorized");
  if (req.method !== "GET" && req.method !== "HEAD" && !checkOrigin(req)) {
    throw new HttpError(403, "forbidden");
  }
  return s;
}

// ---------- Tham số danh sách ----------
function listParams(sp) {
  const page = /^\d+$/.test(sp.get("page") || "") ? Math.max(1, parseInt(sp.get("page"), 10)) : 1;
  const sortRaw = sp.get("sort");
  const sort = ["newest", "score", "name"].includes(sortRaw) ? sortRaw : "newest";
  const q = String(sp.get("q") || "").trim().slice(0, 100);
  return { page, sort, q };
}

// ---------- API ----------
async function handleApi(req, res, url) {
  const p = url.pathname;
  const m = req.method;
  const allow = (methods) => {
    if (!methods.includes(m)) { res.setHeader("Allow", methods.join(", ")); throw new HttpError(405, "method_not_allowed"); }
  };

  // Đăng ký người chơi (F-16 → F-19)
  if (p === "/api/players") {
    allow(["POST"]);
    if (!registerLimiter.allow(clientIp(req))) throw new HttpError(429, "rate_limited");
    const body = await readJson(req);
    const r = V.validateRegistration({
      fullName: body.fullName, email: body.email, phone: body.phone, consent: body.consent
    });
    if (!r.ok) throw new HttpError(400, "validation", { fields: r.errors });
    const token = crypto.randomBytes(32).toString("hex");
    const saved = await db.upsertPlayer(r.value, U.sha256hex(token));
    console.log(`${saved.created ? "Đăng ký mới" : "Cập nhật"} người chơi id=${saved.id}`);
    return sendJson(res, saved.created ? 201 : 200, { id: saved.id, name: saved.name, token });
  }

  // Gửi điểm (F-22)
  if (p === "/api/scores") {
    allow(["POST"]);
    const auth = String(req.headers.authorization || "");
    const mt = /^Bearer ([0-9a-f]{64})$/.exec(auth);
    if (!mt) throw new HttpError(401, "unauthorized");
    const tokenHash = U.sha256hex(mt[1]);
    if (!scoreLimiter.allow(tokenHash)) throw new HttpError(429, "rate_limited");
    const body = await readJson(req);
    if (!V.isValidScore(body.score)) throw new HttpError(400, "invalid_score");
    const r = await db.recordScore(tokenHash, body.score);
    if (!r) throw new HttpError(401, "unauthorized");
    return sendJson(res, 200, { bestScore: r.bestScore, playsCount: r.playsCount });
  }

  // ----- Quản trị (F-23 → F-31) -----
  if (p === "/api/admin/login") {
    allow(["POST"]);
    if (!ADMIN_ENABLED) throw new HttpError(503, "admin_disabled");
    if (!checkOrigin(req)) throw new HttpError(403, "forbidden");
    const ip = clientIp(req);
    if (loginGuard.isLocked(ip)) throw new HttpError(429, "locked");
    const body = await readJson(req);
    const okUser = U.safeEqual(String(body.username || ""), ADMIN_USERNAME);
    const okPass = U.safeEqual(String(body.password || ""), ADMIN_PASSWORD);
    if (!(okUser && okPass)) {
      const locked = loginGuard.fail(ip);
      console.warn(`Đăng nhập quản trị sai từ ${ip}${locked ? " — đã khoá 15 phút" : ""}`);
      throw new HttpError(locked ? 429 : 401, locked ? "locked" : "bad_credentials");
    }
    loginGuard.success(ip);
    const sid = crypto.randomBytes(32).toString("hex");
    sessions.set(sid, { username: ADMIN_USERNAME, expiresAt: Date.now() + SESSION_MS });
    console.log("Quản trị đăng nhập thành công");
    return sendJson(res, 204, null, { "Set-Cookie": sessionCookie(sid, SESSION_MS / 1000) });
  }

  if (p === "/api/admin/logout") {
    allow(["POST"]);
    if (!checkOrigin(req)) throw new HttpError(403, "forbidden");
    const s = getSession(req);
    if (s) sessions.delete(s.id);
    return sendJson(res, 204, null, { "Set-Cookie": sessionCookie("", 0) });
  }

  if (p === "/api/admin/me") {
    allow(["GET"]);
    const s = requireAdmin(req);
    return sendJson(res, 200, { username: s.username });
  }

  if (p === "/api/admin/players") {
    allow(["GET"]);
    requireAdmin(req);
    return sendJson(res, 200, await db.listPlayers(listParams(url.searchParams)));
  }

  if (p === "/api/admin/players.csv") {
    allow(["GET"]);
    requireAdmin(req);
    const { q, sort } = listParams(url.searchParams);
    const items = await db.allPlayers({ q, sort });
    const rows = [["STT", "Họ tên", "Email", "Số điện thoại", "Điểm cao nhất", "Số lượt chơi", "Ngày đăng ký", "Lần chơi cuối"]];
    items.forEach((it, i) => rows.push([
      i + 1, it.fullName, it.email, V.formatPhone(it.phone), it.bestScore, it.playsCount,
      U.formatVnDateTime(it.createdAt), U.formatVnDateTime(it.lastPlayedAt)
    ]));
    const body = U.toCsv(rows);
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${U.csvFileName()}"`,
      "Content-Length": Buffer.byteLength(body)
    });
    return res.end(body);
  }

  if (p === "/api/admin/players/delete") {
    allow(["POST"]);
    requireAdmin(req);
    const body = await readJson(req);
    const ids = Array.isArray(body.ids) ? body.ids : null;
    if (!ids || ids.length === 0 || ids.length > BULK_MAX ||
        !ids.every((x) => Number.isSafeInteger(x) && x > 0)) {
      throw new HttpError(400, "invalid_ids");
    }
    const n = await db.deletePlayers([...new Set(ids)]);
    console.log(`Đã xoá ${n} người chơi (xoá nhiều)`);
    return sendJson(res, 200, { deleted: n });
  }

  const md = /^\/api\/admin\/players\/(\d+)$/.exec(p);
  if (md) {
    allow(["DELETE"]);
    requireAdmin(req);
    const id = Number(md[1]);
    if (!Number.isSafeInteger(id)) throw new HttpError(404, "not_found");
    if (!(await db.deletePlayer(id))) throw new HttpError(404, "not_found");
    console.log(`Đã xoá người chơi id=${id}`);
    return sendJson(res, 204, null);
  }

  throw new HttpError(404, "not_found");
}

// ---------- File tĩnh ----------
/** Đổi đường dẫn URL thành file trên đĩa; trả về null nếu ra ngoài thư mục được phép. */
function resolveFile(urlPath) {
  let base = APP_DIR;
  let rel = urlPath;
  if (rel === "/admin") rel = "/admin/";
  if (rel === "/design" || rel.startsWith("/design/")) {
    base = DESIGN_DIR;
    rel = rel.slice("/design".length);
  }
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  const file = path.resolve(base, "." + rel);
  if (file !== base && !file.startsWith(base + path.sep)) return null;
  return file;
}

function serveStatic(req, res, urlPath) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return sendText(res, 405, "Method Not Allowed");
  }
  const file = resolveFile(urlPath);
  if (!file) return sendText(res, 403, "Forbidden");
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return sendText(res, 404, "Not Found");
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-cache"
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let logPath = "?";
  res.on("finish", () => {
    // Không ghi chuỗi truy vấn (có thể chứa từ khoá tìm kiếm), thân yêu cầu hay cookie.
    console.log(`${req.method} ${logPath} ${res.statusCode} ${Date.now() - started}ms`);
  });
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);

  let url, urlPath;
  try {
    url = new URL(req.url, "http://localhost");
    urlPath = decodeURIComponent(url.pathname);
    logPath = url.pathname;
  } catch (e) {
    return sendText(res, 400, "Bad Request");
  }

  if (urlPath === "/healthz") {
    try { await db.ping(); return sendText(res, 200, "ok"); }
    catch (e) { return sendText(res, 503, "database unavailable"); }
  }

  if (urlPath === "/api" || urlPath.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
    try {
      await handleApi(req, res, url);
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, Object.assign({ error: err.code }, err.extra || {}));
      } else {
        console.error("Lỗi xử lý API:", err && err.message);
        if (!res.headersSent) sendJson(res, 500, { error: "server_error" });
        else res.end();
      }
    }
    return;
  }

  serveStatic(req, res, urlPath);
});

async function main() {
  if (!ADMIN_ENABLED) {
    console.warn("CẢNH BÁO: ADMIN_PASSWORD chưa đặt hoặc ngắn hơn 12 ký tự — trang /admin bị tắt.");
  }
  await db.init();
  console.log("Đã kết nối PostgreSQL, bảng players sẵn sàng.");
  server.listen(PORT, HOST, () => {
    console.log(`Đập Chuột đang chạy tại http://localhost:${PORT} (quản trị: /admin)`);
  });
}

main().catch((err) => {
  console.error("Không khởi động được server:", err.message);
  process.exit(1);
});

// Docker gửi SIGTERM khi dừng container: đóng server và database gọn gàng.
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log(`Nhận ${sig}, đang dừng server…`);
    server.close(() => db.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
