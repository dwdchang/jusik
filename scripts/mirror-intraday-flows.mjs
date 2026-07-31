#!/usr/bin/env node
/**
 * 장중 수급 슬롯 → 맥미니 SQLite 미러 (Phase 92).
 *
 * Redis의 `market:investorIntraday:{시장}:archive:{날짜}`(정규 회차)와
 * `:manual:{날짜}`(수동 트리거)를 읽어 로컬 SQLite에 적재한다. Redis 쪽이 원천이고
 * 여기는 **복제본**이라, 이 스크립트가 며칠 안 돌아도 데이터가 유실되지 않는다
 * (그래서 삭제·롤오버를 하지 않는다 — 실패해도 다음 실행이 따라잡는다).
 *
 * 쓰는 이유는 두 가지다. ① 확률 분석을 SQL로 하려고 — 시간대별 분위수가
 * `WHERE hhmm = '0910'` 한 줄로 나온다. ② Redis 계정 사고에 대비한 오프라인 사본.
 *
 * 사용법:
 *   node --no-warnings scripts/mirror-intraday-flows.mjs [옵션]
 *     --db=<경로>        SQLite 파일 (기본 ~/jusik-mirror/intraday-flows.sqlite)
 *     --env-file=<경로>  env 파일 (기본 프로젝트 루트 .env.local)
 *     --full             이미 받은 과거 날짜까지 전부 다시 받는다
 *     --dry-run          읽기만 하고 DB에 쓰지 않는다
 *
 * `--no-warnings`는 node:sqlite의 ExperimentalWarning을 감추기 위한 것으로, 없어도
 * 동작에는 영향이 없다.
 *
 * 토큰: `UPSTASH_REDIS_REST_READONLY_TOKEN`이 있으면 그것을, 없으면
 * `UPSTASH_REDIS_REST_TOKEN`을 쓴다. 맥미니에는 **읽기 전용 토큰**을 두는 것이 좋다 —
 * 이 스크립트는 SCAN·MGET만 하므로 쓰기 권한이 필요 없고, 장비가 뚫려도 원본을
 * 지울 수 없게 된다.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** store.ts의 INTRADAY_ARCHIVE_SCAN_MATCH와 짝 — 키 형태를 바꾸면 여기도 고친다 */
const ARCHIVE_MATCH = "market:investorIntraday:*:archive:*";
const MANUAL_MATCH = "market:investorIntraday:*:manual:*";

/** 확정된 과거 날짜도 이 일수만큼은 다시 받는다 — 잡 지연·주말·부분 적재 보정 */
const RECHECK_DAYS = 3;

function parseArgs(argv) {
  const args = { full: false, dryRun: false, db: null, envFile: null };
  for (const raw of argv.slice(2)) {
    if (raw === "--full") args.full = true;
    else if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--db=")) args.db = raw.slice(5);
    else if (raw.startsWith("--env-file=")) args.envFile = raw.slice(11);
    else {
      console.error(`알 수 없는 옵션: ${raw}`);
      process.exit(2);
    }
  }
  return args;
}

/**
 * .env 파일에서 필요한 키만 읽는다 — process.env에 이미 있으면 그쪽이 이긴다
 * (맥미니에서 launchd 환경변수로 주는 경우를 위해).
 */
function loadEnv(envFile) {
  const path = envFile ?? resolve(PROJECT_ROOT, ".env.local");
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return; // 파일이 없어도 process.env만으로 돌 수 있다
  }
  for (const line of text.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match === null) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token =
    process.env.UPSTASH_REDIS_REST_READONLY_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    console.error(
      "UPSTASH_REDIS_REST_URL과 토큰이 필요합니다 " +
        "(UPSTASH_REDIS_REST_READONLY_TOKEN 권장, 없으면 UPSTASH_REDIS_REST_TOKEN)."
    );
    process.exit(1);
  }
  return { url, token };
}

async function redisCommand({ url, token }, command) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) {
    throw new Error(
      `Redis ${command[0]} 실패: HTTP ${response.status} ${await response.text()}`
    );
  }
  const body = await response.json();
  if (body.error) throw new Error(`Redis ${command[0]} 오류: ${body.error}`);
  return body.result;
}

/** MATCH에 걸리는 키를 전부 모은다 (SCAN 커서 순회) */
async function scanKeys(config, match) {
  const keys = [];
  let cursor = "0";
  do {
    const [next, batch] = await redisCommand(config, [
      "SCAN",
      cursor,
      "MATCH",
      match,
      "COUNT",
      "500",
    ]);
    cursor = String(next);
    keys.push(...batch);
  } while (cursor !== "0");
  return keys;
}

/** 키 → { market, tradingDate, source } (형태가 안 맞으면 null) */
function parseKey(key) {
  const match =
    /^market:investorIntraday:(kospi|kosdaq):(archive|manual):(\d{4}-\d{2}-\d{2})$/.exec(
      key
    );
  if (match === null) return null;
  const [, market, kind, tradingDate] = match;
  return {
    market: market === "kospi" ? "KOSPI" : "KOSDAQ",
    tradingDate,
    source: kind === "archive" ? "qstash" : "manual",
  };
}

/**
 * 기관 세부 7종 (Phase 93에서 슬롯에 추가) — 확장 이전 거래일에는 값이 없어
 * 전부 NULL 허용이다. 슬롯의 키 이름을 그대로 컬럼명으로 쓴다.
 */
const DETAIL_COLUMNS = [
  "fin_invest",
  "trust",
  "private_fund",
  "bank",
  "insurance",
  "merchant_bank",
  "pension",
];

/** SQLite 컬럼명 → 슬롯 키 */
const DETAIL_SLOT_KEYS = {
  fin_invest: "finInvest",
  trust: "trust",
  private_fund: "privateFund",
  bank: "bank",
  insurance: "insurance",
  merchant_bank: "merchantBank",
  pension: "pension",
};

function openDatabase(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  // 슬롯 하나가 곧 한 행. PK가 (시장·거래일·시각·출처)라 다시 받아도 중복되지 않고,
  // 장중에 슬롯이 늘어난 날은 새 행만 추가된다.
  db.exec(`
    CREATE TABLE IF NOT EXISTS intraday_slot (
      market        TEXT    NOT NULL,
      trading_date  TEXT    NOT NULL,
      hhmm          TEXT    NOT NULL,
      source        TEXT    NOT NULL,
      individual    INTEGER NOT NULL,
      foreign_net   INTEGER NOT NULL,
      institution   INTEGER NOT NULL,
      trading_value INTEGER,
      fin_invest    INTEGER,
      trust         INTEGER,
      private_fund  INTEGER,
      bank          INTEGER,
      insurance     INTEGER,
      merchant_bank INTEGER,
      pension       INTEGER,
      fetched_at    TEXT    NOT NULL,
      mirrored_at   TEXT    NOT NULL,
      PRIMARY KEY (market, trading_date, hhmm, source)
    );
    CREATE INDEX IF NOT EXISTS idx_slot_hhmm ON intraday_slot (source, hhmm);
    CREATE INDEX IF NOT EXISTS idx_slot_date ON intraday_slot (trading_date);
  `);

  // Phase 92에 만들어진 DB에는 세부 7컬럼이 없다. CREATE TABLE IF NOT EXISTS는
  // 기존 테이블을 손대지 않으므로 빠진 컬럼만 따로 붙인다(재실행해도 안전).
  const existing = new Set(
    db.prepare("PRAGMA table_info(intraday_slot)").all().map((c) => c.name)
  );
  for (const column of DETAIL_COLUMNS) {
    if (!existing.has(column)) {
      db.exec(`ALTER TABLE intraday_slot ADD COLUMN ${column} INTEGER`);
    }
  }

  return db;
}

/** 이미 받아둔 (거래일·출처) 조합 — 과거 확정분을 다시 받지 않기 위한 목록 */
function existingDates(db) {
  const rows = db
    .prepare(
      "SELECT DISTINCT trading_date, source FROM intraday_slot"
    )
    .all();
  return new Set(rows.map((r) => `${r.source}:${r.trading_date}`));
}

/** 오늘부터 RECHECK_DAYS일 전까지(KST) — 이 구간은 확정 전일 수 있어 항상 다시 받는다 */
function recentDates() {
  const dates = new Set();
  const nowKst = Date.now() + 9 * 60 * 60 * 1000;
  for (let i = 0; i < RECHECK_DAYS; i += 1) {
    dates.add(
      new Date(nowKst - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    );
  }
  return dates;
}

async function main() {
  const args = parseArgs(process.argv);
  loadEnv(args.envFile);
  const config = redisConfig();

  const dbPath =
    args.db ??
    process.env.MIRROR_DB_PATH ??
    resolve(homedir(), "jusik-mirror/intraday-flows.sqlite");
  const db = openDatabase(dbPath);

  const [archiveKeys, manualKeys] = await Promise.all([
    scanKeys(config, ARCHIVE_MATCH),
    scanKeys(config, MANUAL_MATCH),
  ]);

  const known = args.full ? new Set() : existingDates(db);
  const recent = recentDates();
  const targets = [...archiveKeys, ...manualKeys]
    .map((key) => ({ key, meta: parseKey(key) }))
    .filter(({ meta }) => meta !== null)
    .filter(
      ({ meta }) =>
        recent.has(meta.tradingDate) ||
        !known.has(`${meta.source}:${meta.tradingDate}`)
    );

  if (targets.length === 0) {
    console.log(
      `새로 받을 거래일이 없습니다 (Redis 키 ${archiveKeys.length + manualKeys.length}개, DB ${dbPath}).`
    );
    db.close();
    return;
  }

  const insert = db.prepare(`
    INSERT INTO intraday_slot (
      market, trading_date, hhmm, source,
      individual, foreign_net, institution, trading_value,
      ${DETAIL_COLUMNS.join(", ")},
      fetched_at, mirrored_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${DETAIL_COLUMNS.map(() => "?").join(", ")}, ?, ?)
    ON CONFLICT (market, trading_date, hhmm, source) DO UPDATE SET
      individual    = excluded.individual,
      foreign_net   = excluded.foreign_net,
      institution   = excluded.institution,
      trading_value = excluded.trading_value,
      ${DETAIL_COLUMNS.map((c) => `${c} = excluded.${c}`).join(",\n      ")},
      fetched_at    = excluded.fetched_at,
      mirrored_at   = excluded.mirrored_at
  `);

  const mirroredAt = new Date().toISOString();
  let slotCount = 0;
  let dayCount = 0;

  // 100키씩 나눠 받는다 — 10년치를 한 번에 MGET하면 응답이 수십 MB가 된다
  for (let i = 0; i < targets.length; i += 100) {
    const batch = targets.slice(i, i + 100);
    const values = await redisCommand(config, [
      "MGET",
      ...batch.map((t) => t.key),
    ]);

    for (let j = 0; j < batch.length; j += 1) {
      const raw = values[j];
      if (raw === null || raw === undefined) continue;
      const stored = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!Array.isArray(stored?.slots)) continue;

      const { market, tradingDate, source } = batch[j].meta;
      if (!args.dryRun) {
        for (const slot of stored.slots) {
          insert.run(
            market,
            tradingDate,
            slot.hhmm,
            source,
            slot.individual,
            slot.foreign,
            slot.institution,
            slot.tradingValue ?? null,
            // 세부 7종은 §93 이전 거래일 슬롯에 없다 — 그대로 NULL로 들어간다
            ...DETAIL_COLUMNS.map((c) => slot[DETAIL_SLOT_KEYS[c]] ?? null),
            stored.fetchedAt ?? "",
            mirroredAt
          );
        }
      }
      slotCount += stored.slots.length;
      dayCount += 1;
    }
  }

  const total = db
    .prepare("SELECT COUNT(*) AS n FROM intraday_slot")
    .get().n;
  const days = db
    .prepare("SELECT COUNT(DISTINCT trading_date) AS n FROM intraday_slot")
    .get().n;
  db.close();

  console.log(
    `${args.dryRun ? "[dry-run] " : ""}미러 완료 — ` +
      `${dayCount}개 (시장×거래일) / 슬롯 ${slotCount}개 반영. ` +
      `누적 ${total}행 · ${days}거래일 · ${dbPath}`
  );
}

main().catch((error) => {
  console.error("미러 실패:", error);
  process.exit(1);
});
