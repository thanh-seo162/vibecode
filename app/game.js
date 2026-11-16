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
  var screens = { start: $("screen-start"), playing: $("screen-play"), ended: $("screen-end") };
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

  el.btnStart.addEventListener("click", startRound);
  el.btnReplay.addEventListener("click", startRound);

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

  // ---------- Khởi động ----------
  el.startHigh.textContent = String(highScore);
  showScreen("start");
})();
