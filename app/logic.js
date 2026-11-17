/* ==========================================================================
   Đập Chuột — logic thuần (không đụng DOM, không tự gọi hẹn giờ).
   Đặc tả: docs/04-quy-tac-du-lieu.html. Gắn vào biến toàn cục DapChuot
   vì game chạy qua file:// nên không dùng ES module.
   ========================================================================== */
(function (global) {
  "use strict";

  var CONFIG = {
    GRID_SIZE: 3,
    HOLE_COUNT: 9,
    ROUND_MS: 30000,
    UP_MIN_MS: 800,
    UP_MAX_MS: 1200,
    GAP_MIN_MS: 300,
    GAP_MAX_MS: 500,
    HIT_SHOW_MS: 200,
    WARN_SECONDS: 5,
    POINTS_PER_HIT: 1,
    STORAGE_KEY: "dapChuot.highScore",
    PLAYER_KEY: "dapChuot.player"
  };

  /** Số ngẫu nhiên đều trong [min, max]. */
  function randomBetween(min, max, rand) {
    rand = rand || Math.random;
    return min + rand() * (max - min);
  }

  /** Chọn hang 0–8, khác lastHole; mỗi hang còn lại xác suất 1/8. */
  function pickHole(lastHole, rand) {
    rand = rand || Math.random;
    if (lastHole === null || lastHole === undefined) {
      return Math.floor(rand() * CONFIG.HOLE_COUNT);
    }
    var k = Math.floor(rand() * (CONFIG.HOLE_COUNT - 1));
    if (k >= lastHole) k = k + 1;
    return k;
  }

  /** Trạng thái một lượt mới. */
  function createRound(now, highScore, prevRoundId) {
    var prev = typeof prevRoundId === "number" ? prevRoundId : 0;
    return {
      phase: "playing",
      roundId: prev + 1,
      score: 0,
      startAt: now,
      endAt: now + CONFIG.ROUND_MS,
      mouse: { state: "hidden", hole: null },
      lastHole: null,
      highScore: highScore,
      isNewRecord: false
    };
  }

  function showMouse(state, hole) {
    state.mouse = { state: "up", hole: hole };
    state.lastHole = hole;
  }

  function hideMouse(state) {
    state.mouse = { state: "hidden", hole: null };
  }

  /** Cộng điểm và trả về true khi và chỉ khi cú bấm hợp lệ. */
  function tryHit(state, hole, now) {
    if (state.phase !== "playing") return false;
    if (!(now < state.endAt)) return false;
    if (state.mouse.state !== "up") return false;
    if (hole !== state.mouse.hole) return false;
    state.score += CONFIG.POINTS_PER_HIT;
    state.mouse.state = "hit";
    return true;
  }

  function isCurrentRound(state, id) {
    return !!state && id === state.roundId;
  }

  function remainingMs(state, now) {
    return Math.max(0, state.endAt - now);
  }

  function displaySeconds(ms) {
    return Math.ceil(ms / 1000);
  }

  function isWarning(seconds) {
    return seconds <= CONFIG.WARN_SECONDS;
  }

  /** Kết thúc lượt. Gọi lần thứ hai không đổi gì. */
  function finishRound(state) {
    if (state.phase === "ended") return;
    state.phase = "ended";
    hideMouse(state);
    state.isNewRecord = state.score > state.highScore;
  }

  /** Chuỗi đã lưu → số nguyên ≥ 0; giá trị lỗi thì là 0. */
  function parseHighScore(raw) {
    if (raw === null || raw === undefined) return 0;
    var n = parseInt(raw, 10);
    if (!isFinite(n) || n < 0) return 0;
    return n;
  }

  function loadHighScore(storage) {
    try {
      if (!storage) return 0;
      return parseHighScore(storage.getItem(CONFIG.STORAGE_KEY));
    } catch (e) {
      return 0;
    }
  }

  /** Ghi kỷ lục; trả về false nếu bộ nhớ lỗi (không ném lỗi ra ngoài). */
  function saveHighScore(storage, n) {
    try {
      if (!storage) return false;
      storage.setItem(CONFIG.STORAGE_KEY, String(n));
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- Người chơi trên máy (F-20) ----------

  /** Chuỗi JSON đã lưu → { id, name, token } hoặc null nếu thiếu/hỏng. */
  function parsePlayer(raw) {
    if (typeof raw !== "string" || raw === "") return null;
    var p;
    try { p = JSON.parse(raw); } catch (e) { return null; }
    if (!p || typeof p !== "object") return null;
    if (typeof p.id !== "number" || !(p.id > 0) || Math.floor(p.id) !== p.id) return null;
    if (typeof p.name !== "string" || p.name === "") return null;
    if (typeof p.token !== "string" || !/^[0-9a-f]{64}$/.test(p.token)) return null;
    return { id: p.id, name: p.name, token: p.token };
  }

  function loadPlayer(storage) {
    try {
      if (!storage) return null;
      return parsePlayer(storage.getItem(CONFIG.PLAYER_KEY));
    } catch (e) {
      return null;
    }
  }

  function savePlayer(storage, p) {
    try {
      if (!storage) return false;
      storage.setItem(CONFIG.PLAYER_KEY, JSON.stringify({ id: p.id, name: p.name, token: p.token }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearPlayer(storage) {
    try {
      if (!storage) return false;
      storage.removeItem(CONFIG.PLAYER_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  global.DapChuot = {
    parsePlayer: parsePlayer,
    loadPlayer: loadPlayer,
    savePlayer: savePlayer,
    clearPlayer: clearPlayer,
    CONFIG: CONFIG,
    randomBetween: randomBetween,
    pickHole: pickHole,
    createRound: createRound,
    showMouse: showMouse,
    hideMouse: hideMouse,
    tryHit: tryHit,
    isCurrentRound: isCurrentRound,
    remainingMs: remainingMs,
    displaySeconds: displaySeconds,
    isWarning: isWarning,
    finishRound: finishRound,
    parseHighScore: parseHighScore,
    loadHighScore: loadHighScore,
    saveHighScore: saveHighScore
  };
})(this);
