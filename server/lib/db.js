/* Truy cập PostgreSQL. Kết nối đọc từ biến môi trường PGHOST, PGUSER,
   PGPASSWORD, PGDATABASE, PGPORT (thư viện pg tự đọc).
   Mọi câu lệnh dùng tham số ($1, $2…), không nối chuỗi dữ liệu. */
"use strict";

const { Pool } = require("pg");
const V = require("../../app/validate.js");
const { escapeLike } = require("./util.js");

const PAGE_SIZE = 20;
const SEARCH_MAX = 100;
const SCHEMA_VERSION = 1;

const pool = new Pool({ max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
pool.on("error", (err) => console.error("Lỗi kết nối database (pool):", err.message));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_meta (
  id      INT PRIMARY KEY CHECK (id = 1),
  version INT NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name      TEXT NOT NULL,
  name_search    TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  phone          TEXT NOT NULL,
  best_score     INT NOT NULL DEFAULT 0 CHECK (best_score BETWEEN 0 AND ${V.MAX_SCORE}),
  plays_count    INT NOT NULL DEFAULT 0 CHECK (plays_count >= 0),
  token_hash     TEXT NOT NULL,
  consent_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL,
  last_played_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS players_created_at_idx ON players (created_at);
CREATE INDEX IF NOT EXISTS players_best_score_idx ON players (best_score);
CREATE INDEX IF NOT EXISTS players_token_hash_idx ON players (token_hash);
INSERT INTO schema_meta (id, version) VALUES (1, ${SCHEMA_VERSION}) ON CONFLICT (id) DO NOTHING;
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tạo bảng nếu chưa có; thử lại vài lần trong lúc PostgreSQL đang khởi động. */
async function init({ retries = 20, delayMs = 1500 } = {}) {
  for (let i = 1; ; i++) {
    try {
      await pool.query(SCHEMA);
      return;
    } catch (err) {
      if (i >= retries) throw err;
      console.warn(`Chưa kết nối được database (lần ${i}/${retries}): ${err.message}`);
      await sleep(delayMs);
    }
  }
}

async function ping() {
  await pool.query("SELECT 1");
}

/** Thêm mới hoặc cập nhật theo email (Q5). Trả về { id, name, created }. */
async function upsertPlayer({ fullName, email, phone }, tokenHash) {
  const now = new Date();
  const { rows } = await pool.query(
    `INSERT INTO players (full_name, name_search, email, phone, token_hash, consent_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6, $6)
     ON CONFLICT (email) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       name_search = EXCLUDED.name_search,
       phone = EXCLUDED.phone,
       token_hash = EXCLUDED.token_hash,
       consent_at = EXCLUDED.consent_at,
       updated_at = EXCLUDED.updated_at
     RETURNING id, full_name, (xmax = 0) AS created`,
    [fullName, V.foldText(fullName), email, phone, tokenHash, now]
  );
  const r = rows[0];
  return { id: Number(r.id), name: r.full_name, created: r.created };
}

/** Ghi một lượt chơi; trả về null nếu token không thuộc người chơi nào. */
async function recordScore(tokenHash, score) {
  const { rows } = await pool.query(
    `UPDATE players
       SET plays_count = plays_count + 1,
           best_score = GREATEST(best_score, $2),
           last_played_at = $3
     WHERE token_hash = $1
     RETURNING id, best_score, plays_count`,
    [tokenHash, score, new Date()]
  );
  if (!rows.length) return null;
  return { id: Number(rows[0].id), bestScore: rows[0].best_score, playsCount: rows[0].plays_count };
}

/** Điều kiện tìm kiếm theo docs/04 › Tìm kiếm. */
function buildSearch(qRaw) {
  const q = String(qRaw || "").trim().slice(0, SEARCH_MAX);
  if (!q) return { where: "", params: [] };
  const params = [];
  const conds = [];
  const add = (v) => { params.push(v); return "$" + params.length; };

  conds.push(`name_search LIKE ${add("%" + escapeLike(V.foldText(q)) + "%")} ESCAPE '\\'`);
  conds.push(`email LIKE ${add("%" + escapeLike(q.toLowerCase()) + "%")} ESCAPE '\\'`);

  let digits = q.replace(/[\s.\-]/g, "");
  if (/^\+84/.test(digits)) digits = "0" + digits.slice(3);
  digits = digits.replace(/\D/g, "");
  if (digits.length >= 3) conds.push(`phone LIKE ${add("%" + digits + "%")}`);

  return { where: "WHERE " + conds.join(" OR "), params };
}

const ORDER = {
  newest: "created_at DESC, id DESC",
  score: "best_score DESC, created_at DESC, id DESC",
  name: "name_search ASC, id ASC"
};

function orderBy(sort) { return ORDER[sort] || ORDER.newest; }

const COLS = "id, full_name, email, phone, best_score, plays_count, created_at, last_played_at";

function toItem(r) {
  return {
    id: Number(r.id),
    fullName: r.full_name,
    email: r.email,
    phone: r.phone,
    bestScore: r.best_score,
    playsCount: r.plays_count,
    createdAt: r.created_at.toISOString(),
    lastPlayedAt: r.last_played_at ? r.last_played_at.toISOString() : null
  };
}

async function listPlayers({ q, page, sort }) {
  const { where, params } = buildSearch(q);
  const offset = (page - 1) * PAGE_SIZE;
  const [list, count, all] = await Promise.all([
    pool.query(
      `SELECT ${COLS} FROM players ${where} ORDER BY ${orderBy(sort)}
       LIMIT ${PAGE_SIZE} OFFSET $${params.length + 1}`,
      [...params, offset]
    ),
    pool.query(`SELECT COUNT(*)::int AS n FROM players ${where}`, params),
    pool.query("SELECT COUNT(*)::int AS n FROM players")
  ]);
  return {
    items: list.rows.map(toItem),
    total: count.rows[0].n,
    page,
    pageSize: PAGE_SIZE,
    totalAll: all.rows[0].n
  };
}

async function allPlayers({ q, sort }) {
  const { where, params } = buildSearch(q);
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM players ${where} ORDER BY ${orderBy(sort)}`, params
  );
  return rows.map(toItem);
}

async function deletePlayer(id) {
  const { rowCount } = await pool.query("DELETE FROM players WHERE id = $1", [id]);
  return rowCount > 0;
}

async function deletePlayers(ids) {
  const { rowCount } = await pool.query("DELETE FROM players WHERE id = ANY($1::bigint[])", [ids]);
  return rowCount;
}

async function close() { await pool.end(); }

module.exports = {
  PAGE_SIZE, init, ping, upsertPlayer, recordScore,
  listPlayers, allPlayers, deletePlayer, deletePlayers, close, buildSearch
};
