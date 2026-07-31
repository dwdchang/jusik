# scripts

앱 바깥에서 돌리는 운영 스크립트. Next.js 빌드에 포함되지 않는다.

## mirror-intraday-flows.mjs — 장중 수급 슬롯 맥미니 미러 (Phase 92)

Redis에 영구 축적되는 장중 시각 슬롯을 로컬 SQLite로 복제한다.

### 왜 있나

지수 갱신 잡은 10분마다 시장 전체 투자자 순매수 누계를 슬롯으로 남긴다(§70). 이 값의
**시간대별 분포**를 알아야 "지금 들어오는 매수세가 얼마나 이례적인가"를 확률로 말할 수
있는데, KIS는 과거 거래일의 시간대별 수급을 제공하지 않아(§70 실측) **지나간 날은 어떤
방법으로도 복구되지 않는다.** 그래서 Phase 92에서 날짜별 아카이브 키를 도입했고, 이
스크립트는 그것을 SQL로 다룰 수 있게 로컬로 내린다.

Redis가 원천이고 여기는 복제본이다. 며칠 안 돌아도 유실이 없고, 다음 실행이 따라잡는다.

### 사용법

```bash
node --no-warnings scripts/mirror-intraday-flows.mjs [옵션]
```

| 옵션 | 뜻 |
| --- | --- |
| `--db=<경로>` | SQLite 파일. 기본 `~/jusik-mirror/intraday-flows.sqlite` (`MIRROR_DB_PATH`로도 지정 가능) |
| `--env-file=<경로>` | env 파일. 기본은 프로젝트 루트 `.env.local` |
| `--full` | 이미 받은 과거 날짜까지 전부 다시 받는다 (기본은 미보유 날짜 + 최근 3일만) |
| `--dry-run` | 읽기만 하고 DB에 쓰지 않는다 |

`--no-warnings`는 `node:sqlite`의 ExperimentalWarning을 감추는 용도이고, 없어도 동작에는
영향이 없다. 외부 의존성이 없어 `npm install` 없이 돈다.

### 토큰

`UPSTASH_REDIS_REST_READONLY_TOKEN`이 있으면 그것을, 없으면 `UPSTASH_REDIS_REST_TOKEN`을
쓴다. **맥미니에는 읽기 전용 토큰을 두는 것을 권한다** — 이 스크립트는 SCAN·MGET만 하므로
쓰기 권한이 필요 없고, 장비가 뚫려도 원본을 지울 수 없게 된다. Upstash 콘솔의 데이터베이스
상세 > REST API 에서 read-only token을 확인할 수 있다.

맥미니용 env 파일은 저장소 밖에 둔다:

```bash
mkdir -p ~/.config/jusik
cat > ~/.config/jusik/mirror.env <<'EOF'
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_READONLY_TOKEN=...
EOF
chmod 600 ~/.config/jusik/mirror.env
```

### launchd 등록 (맥미니)

```bash
cp scripts/com.jusik.mirror-intraday.plist ~/Library/LaunchAgents/
# node 경로·프로젝트 경로·env 경로를 환경에 맞게 수정한 뒤
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jusik.mirror-intraday.plist
launchctl kickstart -p gui/$(id -u)/com.jusik.mirror-intraday   # 즉시 1회 실행해 확인
tail -f ~/Library/Logs/jusik-mirror.log
```

해제는 `launchctl bootout gui/$(id -u)/com.jusik.mirror-intraday`.

매일 19:00에 돈다(마지막 갱신 회차 18:15 이후). 장비가 잠들어 있던 시각은 깨어난 뒤
한 번 보충된다.

### 스키마

슬롯 하나가 한 행이다. 금액 단위는 전부 **백만원**이고 부호는 순매수 기준이다.

| 컬럼 | 설명 |
| --- | --- |
| `market` | `KOSPI` / `KOSDAQ` |
| `trading_date` | 거래일 `YYYY-MM-DD` (KST) |
| `hhmm` | 슬롯 시각 `HHMM` — 갱신 잡이 **실제로 돈 시각** |
| `source` | `qstash`(정규 회차) / `manual`(수동 트리거) |
| `individual` / `foreign_net` / `institution` | 그 시각까지의 누적 순매수 |
| `trading_value` | 시장 전체 누적 거래대금. 지수 스냅샷이 없던 회차는 `NULL` |
| `fetched_at` | 잡이 값을 받은 시각 (ISO) |
| `mirrored_at` | 이 행을 복제한 시각 (ISO) |

PK는 `(market, trading_date, hhmm, source)`라 몇 번을 다시 받아도 중복되지 않는다.
`foreign`은 SQL 예약어라 컬럼명이 `foreign_net`이다.

### 분석 시 주의

- **`source = 'qstash'`로 거르고 쓴다.** 수동 트리거(`?force=true`)는 정규 회차 사이
  비정형 시각에 들어와 시간대별 분포를 왜곡한다. 버리지 않고 남겨 두었을 뿐이다.
- **`hhmm`은 정각이 보장되지 않는다.** QStash 회차가 지연되면 `0913` 같은 값이 남는다.
  정상 데이터이므로 버리지 말고, 가까운 10분 버킷에 귀속시켜 집계한다.
- **`0900` 슬롯은 항상 0이다**(장 시작 전). 실질 데이터는 09:10부터 하루 42개.
- 슬롯 값은 **그 시각까지의 누적**이다. 구간 유입량을 보려면 이전 슬롯과의 차를 쓴다.

```sql
-- 09:10 시점 외국인 순매수 분포 (조원 환산)
SELECT trading_date, foreign_net / 1e6 AS foreign_jo
FROM intraday_slot
WHERE source = 'qstash' AND market = 'KOSPI' AND hhmm = '0910'
ORDER BY foreign_jo DESC;

-- 시각별 "누적 순매수 ÷ 누적 거래대금" — 시장 규모에 안 휘둘리는 강도 지표
SELECT hhmm, ROUND(100.0 * foreign_net / trading_value, 1) AS pct
FROM intraday_slot
WHERE source = 'qstash' AND market = 'KOSPI'
  AND trading_date = '2026-07-31' AND trading_value > 0
ORDER BY hhmm;
```
