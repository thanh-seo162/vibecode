/* ==========================================================================
   Đập Chuột — chuẩn hoá và kiểm tra dữ liệu đăng ký (dùng chung).
   Trình duyệt: <script src="validate.js"> → biến toàn cục DapChuotValidate.
   Server: require("../app/validate.js").
   Đặc tả: docs/04-quy-tac-du-lieu.html › Kiểm tra dữ liệu.
   ========================================================================== */
(function (global) {
  "use strict";

  var NAME_MIN = 2;
  var NAME_MAX = 50;
  var EMAIL_MAX = 254;
  var MAX_SCORE = 100;

  var NAME_RE = /^\p{L}[\p{L}\p{M} '.\-]*$/u;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var PHONE_RE = /^0(3|5|7|8|9)\d{8}$/;

  function str(s) { return typeof s === "string" ? s : ""; }

  function normalizeName(s) {
    return str(s).normalize("NFC").trim().replace(/\s+/g, " ");
  }

  function validateName(s) {
    var v = normalizeName(s);
    if (v === "") return "name_required";
    var len = Array.from(v).length;
    if (len < NAME_MIN || len > NAME_MAX) return "name_length";
    if (!NAME_RE.test(v)) return "name_chars";
    return null;
  }

  function normalizeEmail(s) {
    return str(s).normalize("NFC").trim().toLowerCase();
  }

  function validateEmail(s) {
    var v = normalizeEmail(s);
    if (v === "") return "email_required";
    if (v.length > EMAIL_MAX || !EMAIL_RE.test(v)) return "email_format";
    return null;
  }

  function normalizePhone(s) {
    var v = str(s).replace(/[\s.\-()]/g, "");
    var m = /^(?:\+84|84)(\d{9})$/.exec(v);
    if (m) v = "0" + m[1];
    return v;
  }

  function validatePhone(s) {
    var raw = str(s).trim();
    if (raw === "") return "phone_required";
    if (!PHONE_RE.test(normalizePhone(raw))) return "phone_format";
    return null;
  }

  /** input: { fullName, email, phone, consent } → { ok, value, errors } */
  function validateRegistration(input) {
    input = input && typeof input === "object" ? input : {};
    var errors = {};
    var e;
    if ((e = validateName(input.fullName))) errors.fullName = e;
    if ((e = validateEmail(input.email))) errors.email = e;
    if ((e = validatePhone(input.phone))) errors.phone = e;
    if (input.consent !== true) errors.consent = "consent_required";
    var ok = Object.keys(errors).length === 0;
    return {
      ok: ok,
      value: ok ? {
        fullName: normalizeName(input.fullName),
        email: normalizeEmail(input.email),
        phone: normalizePhone(input.phone)
      } : null,
      errors: errors
    };
  }

  /** "0912345678" → "0912 345 678" */
  function formatPhone(digits) {
    var d = str(digits);
    if (!/^\d{10}$/.test(d)) return d;
    return d.slice(0, 4) + " " + d.slice(4, 7) + " " + d.slice(7);
  }

  /** "Nguyễn Văn Đức" → "nguyen van duc" */
  function foldText(s) {
    return str(s).normalize("NFD").replace(/\p{M}/gu, "")
      .replace(/đ/g, "d").replace(/Đ/g, "D")
      .toLowerCase().trim().replace(/\s+/g, " ");
  }

  function isValidScore(n) {
    return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_SCORE;
  }

  var api = {
    NAME_MIN: NAME_MIN,
    NAME_MAX: NAME_MAX,
    EMAIL_MAX: EMAIL_MAX,
    MAX_SCORE: MAX_SCORE,
    normalizeName: normalizeName,
    validateName: validateName,
    normalizeEmail: normalizeEmail,
    validateEmail: validateEmail,
    normalizePhone: normalizePhone,
    validatePhone: validatePhone,
    validateRegistration: validateRegistration,
    formatPhone: formatPhone,
    foldText: foldText,
    isValidScore: isValidScore
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.DapChuotValidate = api;
})(this);
