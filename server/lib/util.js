/* Hàm phụ trợ phía server (thuần, test được). Đặc tả: docs/04 › Hàm mới. */
"use strict";

const crypto = require("crypto");

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh, không có giờ mùa hè

function pad(n) { return String(n).padStart(2, "0"); }

/** Date | chuỗi ISO → "dd/mm/yyyy HH:mm" giờ Việt Nam; rỗng nếu không có. */
function formatVnDateTime(v) {
  if (v === null || v === undefined || v === "") return "";
  const d = new Date(new Date(v).getTime() + VN_OFFSET_MS);
  if (isNaN(d.getTime())) return "";
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Tên file CSV: nguoi-choi-YYYYMMDD-HHmm.csv (giờ Việt Nam). */
function csvFileName(now = new Date()) {
  const d = new Date(now.getTime() + VN_OFFSET_MS);
  return `nguoi-choi-${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}.csv`;
}

/** Một ô CSV: chống chèn công thức Excel, bọc ngoặc kép. */
function csvCell(value) {
  let s = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

/** Mảng các dòng (mảng ô) → chuỗi CSV có BOM, xuống dòng CRLF. */
function toCsv(rows) {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Thoát % _ \ để dùng trong LIKE … ESCAPE '\'. */
function escapeLike(s) {
  return String(s).replace(/[\\%_]/g, (c) => "\\" + c);
}

function sha256hex(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

/** So sánh hai chuỗi thời gian cố định (băm trước để độ dài bằng nhau). */
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Giới hạn tốc độ cửa sổ cố định: allow(key) → true nếu còn lượt. */
function createRateLimiter(limit, windowMs) {
  const hits = new Map();
  const timer = setInterval(() => {
    const t = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
  }, windowMs);
  timer.unref();
  return {
    allow(key) {
      const t = Date.now();
      let e = hits.get(key);
      if (!e || e.resetAt <= t) { e = { count: 0, resetAt: t + windowMs }; hits.set(key, e); }
      e.count += 1;
      return e.count <= limit;
    }
  };
}

/** Chống dò mật khẩu: sai maxFails lần liên tiếp thì khoá lockMs theo IP. */
function createLoginGuard(maxFails = 5, lockMs = 15 * 60 * 1000) {
  const state = new Map(); // ip → { fails, lockedUntil }
  return {
    isLocked(ip) {
      const e = state.get(ip);
      if (!e || !e.lockedUntil) return false;
      if (e.lockedUntil > Date.now()) return true;
      state.delete(ip);
      return false;
    },
    fail(ip) {
      const e = state.get(ip) || { fails: 0, lockedUntil: 0 };
      e.fails += 1;
      if (e.fails >= maxFails) { e.lockedUntil = Date.now() + lockMs; e.fails = 0; }
      state.set(ip, e);
      return e.lockedUntil > Date.now();
    },
    success(ip) { state.delete(ip); }
  };
}

function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    if (!k) return;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) { /* bỏ qua */ }
  });
  return out;
}

module.exports = {
  formatVnDateTime, csvFileName, csvCell, toCsv, escapeLike,
  sha256hex, safeEqual, createRateLimiter, createLoginGuard, parseCookies
};
