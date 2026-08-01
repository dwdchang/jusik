import type { EarningsNewsItem, StoredEarningsNews } from "@/lib/feeds/store";

/**
 * 실적 관련 보도 수집 규칙 — Phase 84 (plan.md §84.2).
 *
 * **왜 뉴스 탭을 재사용하지 않는가**: 뉴스 탭은 종목명 한 단어로 최신순 10건을 담는데,
 * 실적 발표일에는 그 10건이 시황·정치·사업 기사로 채워져 정작 실적 보도가 밀린다
 * (실측 2026-07-30 SK하이닉스: 종목명 단독 쿼리 20건 중 실적 신호 7건, 그나마 제목에
 * 실적이 있는 건은 더 적었다). 쿼리·정렬·필터가 전부 달라야 해서 경로를 나눴다.
 *
 * Redis·네이버 API를 물지 않는 순수 모듈이라 갱신 잡과 화면이 함께 import한다.
 */

/**
 * 실적 뉴스 검색어 — **`"종목명" "영업이익"` + 관련도순(sim)**.
 *
 * 후보 6종을 실응답으로 비교해 골랐다(제목에 실적 신호가 있는 비율):
 *   `종목명` date 7/20 · `종목명 실적` sim 11/15 · `종목명 컨퍼런스콜` sim 6/15 ·
 *   **`"종목명" "영업이익"` sim 15/15**
 * 따옴표로 두 단어를 모두 요구하면 시황 기사가 대부분 빠지고, 관련도순이라 발표 당일
 * 쏟아지는 속보 사이에서도 실적 기사가 앞에 온다.
 */
export function earningsNewsQuery(stockName: string): string {
  return `"${stockName}" "영업이익"`;
}

/**
 * 제목에 실적 신호가 있는가 — 점수 가산용.
 * "어닝"·"컨콜"까지 넣은 건 실측 제목에 `[컨콜]`·`[IR]` 접두 기사가 실제로 있어서다.
 */
const TITLE_SIGNAL =
  /실적|영업이익|영업익|매출|순이익|어닝|흑자|적자|컨콜|컨퍼런스콜|실적발표/;

/**
 * 기사 1건의 관련도 점수. **제목을 요약보다 강하게 본다** — 네이버는 쿼리에 종목명이
 * 있어도 다른 종목 기사를 섞어 주기 때문이다(실측: `현대차 2분기 실적`에 LG엔솔 기사 3건).
 *
 * 다만 제목 매칭을 **필수 조건으로 걸지는 않았다**. 실측 제목에 "삼전 2분기 영업익 89조"
 * ·"하이닉스 2분기 영업이익 60.5조" 같은 **축약형**이 흔해서, 필수로 하면 정작 핵심
 * 기사가 탈락한다. 그래서 요약에만 종목명이 있는 기사는 점수만 낮춰 뒤로 보낸다.
 */
export function scoreEarningsArticle(
  article: { title: string; summary: string },
  stockName: string
): number {
  let score = 0;
  if (article.title.includes(stockName)) {
    score += 2;
  }
  if (TITLE_SIGNAL.test(article.title)) {
    score += 1;
  }
  if (score === 0 && article.summary.includes(stockName)) {
    // 축약형 제목 구제 — 요약에 종목명이 있고 실적 맥락이면 최소 점수로 살린다
    score = TITLE_SIGNAL.test(article.summary) ? 1 : 0;
  }
  return score;
}

/** 종목당 저장하는 실적 보도 최대 건수 — 요약문까지 담으므로 짧게 끊는다 */
export const EARNINGS_NEWS_MAX_ITEMS = 5;

/**
 * 점수 → 최신순으로 상위 N건. 점수 0(=종목·실적 어느 쪽도 안 걸린 기사)은 버린다.
 */
export function rankEarningsArticles<
  T extends { title: string; summary: string; pubDateMs: number },
>(articles: T[], stockName: string, limit = EARNINGS_NEWS_MAX_ITEMS): T[] {
  return articles
    .map((article) => ({
      article,
      score: scoreEarningsArticle(article, stockName),
    }))
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || b.article.pubDateMs - a.article.pubDateMs
    )
    .slice(0, limit)
    .map((row) => row.article);
}

/**
 * 실적 공시 접수일 기준 **며칠 안에** 보도를 모을 것인가.
 * 발표 당일에 대부분 쏟아지지만, 주말·연휴에 걸린 발표와 후속 분석 기사를 담으려고
 * 여유를 뒀다. 이 창을 벗어난 종목은 네이버를 아예 부르지 않는다(평상시 콜 0).
 */
export const EARNINGS_NEWS_WINDOW_DAYS = 7;

/**
 * 스냅샷을 화면에 보여줄 최대 나이(기준 공시 접수일 기준).
 *
 * 수집이 발표 직후에만 돌기 때문에 스냅샷은 **다음 분기 발표까지 그대로 남는다.**
 * 분기(약 90일)의 절반쯤인 45일을 넘으면 "지금 실적 보도"라고 부르기 어려워 숨긴다
 * — 지우지는 않는다(다음 발표 때 덮어써지고, 고아 정리 잡이 종목 단위로 수거한다).
 */
export const EARNINGS_NEWS_MAX_AGE_DAYS = 45;

/** "YYYYMMDD" → UTC 자정 ms. 형식이 아니면 null */
function yyyyMmDdToMs(value: string): number | null {
  if (!/^\d{8}$/.test(value)) {
    return null;
  }
  const ms = Date.parse(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`
  );
  return Number.isNaN(ms) ? null : ms;
}

/** 두 "YYYYMMDD" 사이 일수 — 파싱 불가면 null */
export function daysBetweenYyyyMmDd(
  from: string,
  to: string
): number | null {
  const fromMs = yyyyMmDdToMs(from);
  const toMs = yyyyMmDdToMs(to);
  if (fromMs === null || toMs === null) {
    return null;
  }
  return Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000));
}

/**
 * 문장 종결 위치 — `.`·`!`·`?` 뒤가 공백이거나 문자열 끝인 자리.
 * 뒤가 숫자면 매치되지 않으므로 `1.5조`·`60.5조` 같은 소수점은 자연히 빠진다.
 */
const SENTENCE_END = /[.!?](?=\s|$)/g;

/** 다듬은 결과가 이보다 짧아지면 원문을 그대로 둔다 — 한 문장만 남아 정보가 준다 */
const MIN_TIDIED_CHARS = 40;

/**
 * 발췌를 **마지막 온전한 문장까지**로 다듬는다 (Phase 97).
 *
 * 네이버 뉴스 API의 `description`은 요약이 아니라 **검색어 주변을 잘라낸 스니펫**이라
 * 문장 중간에서 뚝 끊긴다("…5대 데이터센터 고객사와 이미"). 원문 본문을 수집하지 않는
 * 이상(§84.2에서 그은 저작권 선) 진짜 요약을 만들 재료가 없으므로, **끝의 불완전한
 * 조각만 버려** 읽는 느낌을 고친다. 요약이 아니라 정리라는 점은 화면 각주 그대로다.
 *
 * **앞쪽은 건드리지 않는다** — 한국어는 문장이 중간부터 시작했는지 판정할 신뢰할 만한
 * 단서가 없어(영어의 대문자 같은 것이 없다) 잘못 자르면 멀쩡한 첫 문장을 날린다.
 * 선행 말줄임표만 지운다.
 *
 * 원문의 **절반 미만**으로 줄거나 `MIN_TIDIED_CHARS`보다 짧아지면 **원문을 그대로 둔다**
 * — 첫 문장이 짧은 기사에서 다듬기가 오히려 정보를 깎는 경우다.
 */
export function tidyNewsSummary(raw: string): string {
  // 잘린 자리를 표시하는 말줄임표를 먼저 걷어낸다 — 실데이터는 대부분 `…`가 아니라
  // 마침표 3개이고, 온전한 문장 뒤에 붙으면 `썼다....`처럼 4개가 연달아 나온다.
  const base = raw
    .trim()
    .replace(/^(?:…|\.{3})\s*/, "")
    .replace(/\s*(?:…|\.{3})$/, "")
    .trim();
  if (base === "") {
    return raw;
  }

  let lastEnd = -1;
  for (const match of base.matchAll(SENTENCE_END)) {
    lastEnd = match.index;
  }
  // 종결부호가 하나도 없는 스니펫은 자를 자리가 없다 — 말줄임표만 정리하고 그대로 둔다
  if (lastEnd < 0) {
    return base;
  }

  const tidied = base.slice(0, lastEnd + 1);
  if (tidied.length < MIN_TIDIED_CHARS || tidied.length * 2 < base.length) {
    return base;
  }
  return tidied;
}

/**
 * 화면에 실을 보도 목록. 기준 공시가 너무 오래됐으면 빈 배열을 돌려준다.
 * 접수일을 못 읽는 스냅샷(구 버전·손상)은 **보수적으로 숨긴다** — 언제 것인지 모르는
 * 기사를 "최근 실적 보도"라고 붙여 두는 편이 더 나쁘다.
 *
 * 발췌 다듬기(§97)를 **저장이 아니라 여기서** 하는 이유 둘 — ① 이미 저장된 스냅샷에도
 * 즉시 적용돼 다음 발표 시즌을 기다리지 않아도 된다 ② 스냅샷에는 원문이 남아 방침을
 * 되돌리거나 규칙을 바꿔도 재수집이 필요 없다. 점수·필터(`scoreEarningsArticle`)는
 * 수집 시점에 **원문 발췌**로 매기므로 다듬기가 선별에 영향을 주지 않는다.
 */
export function visibleEarningsNews(
  stored: StoredEarningsNews | null,
  todayYyyyMmDd: string
): EarningsNewsItem[] {
  if (stored === null) {
    return [];
  }
  const age = daysBetweenYyyyMmDd(stored.basisRceptDt, todayYyyyMmDd);
  if (age === null || age > EARNINGS_NEWS_MAX_AGE_DAYS) {
    return [];
  }
  return stored.items.map((item) => ({
    ...item,
    summary: tidyNewsSummary(item.summary),
  }));
}
