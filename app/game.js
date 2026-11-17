/* ==========================================================================
   Đập Chuột — nối logic (logic.js) với giao diện: hẹn giờ, sự kiện bấm,
   vẽ màn hình. Đặc tả: docs/02-chuc-nang.html, docs/04-quy-tac-du-lieu.html.
   ========================================================================== */
(function () {
  "use strict";

  var D = window.DapChuot;
  var C = D.CONFIG;

  // ---------- Bộ nhớ ----------
  // Một số trình duyệt ném lỗi ngay khi đọc window.localStorage (chế độ riêng tư, chặn cookie).
  var storage = null;
  try { storage = window.localStorage; } catch (e) { storage = null; }
  // Kỷ lục giữ trong bộ nhớ tạm; dùng khi localStorage không ghi được.
  var highScore = D.loadHighScore(storage);

  // ---------- Phần tử ----------
  var $ = function (id) { return document.getElementById(id); };
  var screens = {
    register: $("screen-register"),
    start: $("screen-start"),
    playing: $("screen-play"),
    ended: $("screen-end")
  };
  var el = {
    startHigh: $("start-high"),
    hudScore: $("hud-score"),
    hudScoreWrap: $("hud-score").parentNode,
    hudTime: $("hud-time"),
    hudTimeWrap: $("hud-time-wrap"),
    hudHigh: $("hud-high"),
    board: $("board"),
    endScore: $("end-score"),
    endNewRecord: $("end-new-record"),
    endHigh: $("end-high"),
    btnStart: $("btn-start"),
    btnReplay: $("btn-replay")
  };

  // ---------- Tạo 9 ô ----------
  var cells = [];
  var tpl = $("cell-template");
  for (var i = 0; i < C.HOLE_COUNT; i++) {
    var cell = tpl.content.firstElementChild.cloneNode(true);
    cell.setAttribute("aria-label", "Hang " + (i + 1));
    cell.dataset.hole = String(i);
    el.board.appendChild(cell);
    cells.push(cell);
  }

  // ---------- Trạng thái chạy ----------
  var state = null;        // trạng thái lượt (logic.js)
  var lastRoundId = 0;
  var mouseUpAt = 0;       // performance.now() lúc chuột bắt đầu thò lên
  var gapTimer = null;     // hẹn giờ khoảng nghỉ
  var upTimer = null;      // hẹn giờ tự lặn
  var endTimer = null;     // hẹn giờ dự phòng kết thúc lượt
  var rafId = null;
  var fxTimers = [];       // hẹn giờ chỉ dành cho hiệu ứng
  var shownSeconds = null;

  function now() { return performance.now(); }

  function showScreen(phase) {
    Object.keys(screens).forEach(function (k) { screens[k].hidden = k !== phase; });
  }

  function clearRoundTimers() {
    clearTimeout(gapTimer); gapTimer = null;
    clearTimeout(upTimer); upTimer = null;
    clearTimeout(endTimer); endTimer = null;
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function clearFx() {
    fxTimers.forEach(clearTimeout);
    fxTimers = [];
  }

  function fx(fn, ms) {
    var t = setTimeout(function () {
      fxTimers.splice(fxTimers.indexOf(t), 1);
      fn();
    }, ms);
    fxTimers.push(t);
  }

  function resetCells() {
    cells.forEach(function (c) {
      c.classList.remove("is-up", "is-hit", "is-flash");
      var floats = c.querySelectorAll(".plus-one");
      for (var j = 0; j < floats.length; j++) floats[j].remove();
    });
  }

  // ---------- HUD ----------
  function renderTime() {
    var secs = D.displaySeconds(D.remainingMs(state, now()));
    if (secs === shownSeconds) return;
    shownSeconds = secs;
    el.hudTime.textContent = String(secs);
    el.hudTimeWrap.classList.toggle("is-warning", D.isWarning(secs));
  }

  function renderScore(bump) {
    el.hudScore.textContent = String(state.score);
    if (bump) {
      el.hudScoreWrap.classList.remove("is-bump");
      void el.hudScoreWrap.offsetWidth; // chạy lại hiệu ứng nảy
      el.hudScoreWrap.classList.add("is-bump");
    }
  }

  // ---------- Vòng một lượt ----------
  function startRound() {
    clearRoundTimers();
    clearFx();
    resetCells();

    state = D.createRound(now(), highScore, lastRoundId);
    lastRoundId = state.roundId;
    var id = state.roundId;

    shownSeconds = null;
    el.hudHigh.textContent = String(highScore);
    el.hudScoreWrap.classList.remove("is-bump");
    renderScore(false);
    renderTime();
    showScreen("playing");

    endTimer = setTimeout(function () { endRound(id); }, C.ROUND_MS);
    rafId = requestAnimationFrame(function () { tick(id); });
    scheduleNextMouse(id);
  }

  function tick(id) {
    rafId = null;
    if (!D.isCurrentRound(state, id) || state.phase !== "playing") return;
    if (D.remainingMs(state, now()) <= 0) { endRound(id); return; }
    renderTime();
    rafId = requestAnimationFrame(function () { tick(id); });
  }

  function scheduleNextMouse(id) {
    clearTimeout(gapTimer);
    gapTimer = setTimeout(function () {
      gapTimer = null;
      if (!D.isCurrentRound(state, id) || state.phase !== "playing") return;
      var t = now();
      if (t >= state.endAt) return; // hết giờ trong lúc nghỉ: không cho chuột mới
      var hole = D.pickHole(state.lastHole);
      D.showMouse(state, hole);
      mouseUpAt = t;
      var c = cells[hole];
      c.classList.remove("is-hit");
      c.classList.add("is-up");
      upTimer = setTimeout(function () { mouseLeaves(id); }, D.randomBetween(C.UP_MIN_MS, C.UP_MAX_MS));
    }, D.randomBetween(C.GAP_MIN_MS, C.GAP_MAX_MS));
  }

  /** Chuột tự lặn xuống (không đổi điểm), bắt đầu khoảng nghỉ. */
  function mouseLeaves(id) {
    upTimer = null;
    if (!D.isCurrentRound(state, id) || state.phase !== "playing") return;
    if (state.mouse.state !== "up") return;
    cells[state.mouse.hole].classList.remove("is-up");
    D.hideMouse(state);
    scheduleNextMouse(id);
  }

  function hitHole(hole) {
    if (!state) return;
    var id = state.roundId;
    if (!D.tryHit(state, hole, now())) return;

    // Trúng: trạng thái "hit" đã đặt ngay; khoảng nghỉ bắt đầu luôn.
    clearTimeout(upTimer); upTimer = null;
    renderScore(true);
    var c = cells[hole];
    c.classList.add("is-hit");
    c.classList.remove("is-flash");
    void c.offsetWidth;
    c.classList.add("is-flash");
    showPlusOne(c);

    D.hideMouse(state);
    scheduleNextMouse(id);

    // Hiệu ứng: hiện hình choáng HIT_SHOW_MS rồi lặn 150ms.
    fx(function () {
      c.classList.remove("is-up");
      fx(function () { c.classList.remove("is-hit", "is-flash"); }, 150);
    }, C.HIT_SHOW_MS);
  }

  function showPlusOne(c) {
    var s = document.createElement("span");
    s.className = "plus-one";
    s.textContent = "+" + C.POINTS_PER_HIT;
    s.setAttribute("aria-hidden", "true");
    c.appendChild(s);
    fx(function () { s.remove(); }, 600);
  }

  /** Kết thúc lượt; chỉ chạy một lần dù gọi từ khung hình, hẹn giờ dự phòng hay khi quay lại tab. */
  function endRound(id) {
    if (!D.isCurrentRound(state, id) || state.phase !== "playing") return;
    D.finishRound(state);
    clearRoundTimers();
    clearFx();
    resetCells();

    if (state.isNewRecord) {
      highScore = state.score;
      D.saveHighScore(storage, highScore);
    }
    submitScore(state.score);

    el.hudTime.textContent = "0";
    el.endScore.textContent = String(state.score);
    el.endNewRecord.hidden = !state.isNewRecord;
    el.endHigh.textContent = String(highScore);
    el.startHigh.textContent = String(highScore);
    showScreen("ended");
    el.btnReplay.focus();
  }

  // ---------- Sự kiện ----------
  // pointerdown: phản hồi ngay khi chạm, mỗi ngón xử lý riêng.
  el.board.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    var c = e.target.closest ? e.target.closest(".cell") : null;
    if (!c || !el.board.contains(c)) return; // khoảng trống giữa các ô
    e.preventDefault(); // không kéo theo focus/chọn chữ/click giả
    hitHole(Number(c.dataset.hole));
  });

  // Bàn phím (nên có): Tab tới ô, bấm Enter hoặc Space.
  el.board.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
    var c = e.target.closest ? e.target.closest(".cell") : null;
    if (!c) return;
    e.preventDefault();
    if (e.repeat) return;
    hitHole(Number(c.dataset.hole));
  });

  el.board.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  el.btnStart.addEventListener("click", function () {
    if (!player) { showRegister(); return; }
    startRound();
  });
  // Người chơi bị xoá trên server (401 khi gửi điểm) → "Chơi lại" đưa về S0.
  el.btnReplay.addEventListener("click", function () {
    if (!player) { showRegister(); return; }
    startRound();
  });

  // Rời tab: đồng hồ vẫn chạy (Q1). Khi quay lại thì đồng bộ ngay.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden || !state || state.phase !== "playing") return;
    var id = state.roundId;
    var t = now();
    if (t >= state.endAt) { endRound(id); return; }
    renderTime();
    if (state.mouse.state === "up" && t - mouseUpAt > C.UP_MAX_MS) {
      clearTimeout(upTimer);
      mouseLeaves(id);
    }
    if (rafId === null) rafId = requestAnimationFrame(function () { tick(id); });
  });

  // ---------- Người chơi & đăng ký (F-16 → F-22) ----------
  var VAL = window.DapChuotValidate;
  // localStorage bị chặn: vẫn nhớ người chơi trong bộ nhớ cho đến khi tải lại trang.
  var player = D.loadPlayer(storage);

  var reg = {
    form: $("register-form"),
    alert: $("reg-alert"),
    btn: $("btn-register"),
    fields: {
      fullName: { input: $("reg-name"), err: $("reg-name-err") },
      email: { input: $("reg-email"), err: $("reg-email-err") },
      phone: { input: $("reg-phone"), err: $("reg-phone-err") },
      consent: { input: $("reg-consent"), err: $("reg-consent-err") }
    },
    sending: false
  };
  var greeting = $("greeting");
  var greetingName = $("greeting-name");
  var btnNotMe = $("btn-not-me");

  var MESSAGES = {
    name_required: "Vui lòng nhập họ và tên",
    name_length: "Họ và tên dài từ 2 đến 50 ký tự",
    name_chars: "Họ và tên chỉ gồm chữ cái, khoảng trắng và các dấu ' . -",
    email_required: "Vui lòng nhập email",
    email_format: "Email chưa đúng định dạng, ví dụ ban@vidu.com",
    phone_required: "Vui lòng nhập số điện thoại",
    phone_format: "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0",
    consent_required: "Bạn cần đồng ý để tiếp tục",
    network: "Không kết nối được máy chủ. Vui lòng thử lại.",
    rate_limited: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
    server: "Có lỗi xảy ra. Vui lòng thử lại."
  };
  var FIELD_ORDER = ["fullName", "email", "phone", "consent"];

  function formInput() {
    var f = reg.fields;
    return {
      fullName: f.fullName.input.value,
      email: f.email.input.value,
      phone: f.phone.input.value,
      consent: f.consent.input.checked
    };
  }

  /** Mã lỗi của một ô (dùng chung quy tắc với server), null nếu hợp lệ. */
  function fieldError(name) {
    var v = formInput();
    if (name === "fullName") return VAL.validateName(v.fullName);
    if (name === "email") return VAL.validateEmail(v.email);
    if (name === "phone") return VAL.validatePhone(v.phone);
    return v.consent === true ? null : "consent_required";
  }

  function setFieldError(name, code) {
    var f = reg.fields[name];
    if (code) {
      f.err.textContent = MESSAGES[code] || MESSAGES.server;
      f.err.hidden = false;
      f.input.setAttribute("aria-invalid", "true");
    } else {
      f.err.textContent = "";
      f.err.hidden = true;
      f.input.removeAttribute("aria-invalid");
    }
  }

  function setAlert(msg) {
    reg.alert.textContent = msg || "";
    reg.alert.hidden = !msg;
  }

  function showErrors(errors) {
    var first = null;
    FIELD_ORDER.forEach(function (name) {
      setFieldError(name, errors[name] || null);
      if (errors[name] && !first) first = name;
    });
    if (first) reg.fields[first].input.focus();
    return !!first;
  }

  // Lỗi hiện khi rời ô; khi ô đang báo lỗi thì sửa đúng là lỗi biến mất ngay.
  FIELD_ORDER.forEach(function (name) {
    var input = reg.fields[name].input;
    input.addEventListener("blur", function () {
      if (name === "consent") return;
      setFieldError(name, fieldError(name));
    });
    input.addEventListener(name === "consent" ? "change" : "input", function () {
      if (input.getAttribute("aria-invalid") === "true") setFieldError(name, fieldError(name));
    });
  });

  function setSending(on) {
    reg.sending = on;
    reg.btn.disabled = on;
    reg.btn.textContent = on ? "Đang gửi…" : "Đăng ký và chơi";
  }

  reg.form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (reg.sending) return;
    setAlert("");
    var input = formInput();
    var check = VAL.validateRegistration(input);
    if (showErrors(check.errors)) return;

    setSending(true);
    fetch("/api/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { status: res.status, data: data };
      });
    }).then(function (r) {
      setSending(false);
      if ((r.status === 200 || r.status === 201) && r.data && r.data.token) {
        player = { id: r.data.id, name: r.data.name, token: r.data.token };
        D.savePlayer(storage, player);
        reg.form.reset();
        showStart();
        el.btnStart.focus();
        return;
      }
      if (r.status === 400 && r.data && r.data.fields) { showErrors(r.data.fields); return; }
      setAlert(r.status === 429 ? MESSAGES.rate_limited : MESSAGES.server);
    }).catch(function () {
      setSending(false);
      setAlert(MESSAGES.network);
    });
  });

  /** Gửi điểm ngầm sau mỗi lượt; lỗi không làm gián đoạn game, không gửi lại. */
  function submitScore(score) {
    if (!player || !window.fetch) return;
    var sentFor = player;
    try {
      fetch("/api/scores", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + sentFor.token },
        body: JSON.stringify({ score: score })
      }).then(function (res) {
        if (res.status === 401 && player === sentFor) forgetPlayer();
      }).catch(function () { /* mất mạng: bỏ qua */ });
    } catch (e) { /* bỏ qua */ }
  }

  function forgetPlayer() {
    player = null;
    D.clearPlayer(storage);
  }

  function showRegister() {
    setAlert("");
    FIELD_ORDER.forEach(function (n) { setFieldError(n, null); });
    showScreen("register");
  }

  function showStart() {
    greetingName.textContent = player ? player.name : "";
    greeting.hidden = !player;
    btnNotMe.hidden = !player;
    el.startHigh.textContent = String(highScore);
    showScreen("start");
  }

  btnNotMe.addEventListener("click", function () {
    forgetPlayer();
    showRegister();
    reg.fields.fullName.input.focus();
  });

  // ---------- Khởi động ----------
  el.startHigh.textContent = String(highScore);
  if (player) showStart(); else showRegister();
})();
