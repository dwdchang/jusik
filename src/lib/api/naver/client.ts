/**
 * 네이버 검색 API — 뉴스 검색 클라이언트 (plan.md §17.13).
 * 갱신 잡(refreshFeeds)만 호출하며, 화면은 Redis 스냅샷만 읽는다.
 * 인증키(NAVER_CLIENT_ID/SECRET)는 서버 전용 — NEXT_PUBLIC_ 금지.
 */

import { toSafeHttpUrl } from "@/lib/format/url";

const NAVER_NEWS_URL = "https://openapi.naver.com/v1/search/news.json";
const NAVER_FETCH_TIMEOUT_MS = 15_000;

/** 네이버 뉴스 API 원본 item — HTML 태그·엔티티가 섞여 온다 */
interface NaverNewsRawItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  /** RFC822 예: "Mon, 14 Jul 2026 09:00:00 +0900" */
  pubDate: string;
}

interface NaverNewsResponse {
  items?: NaverNewsRawItem[];
}

/** 정제된 뉴스 1건 — 태그 제거·pubDate ms 파싱 완료 */
export interface NaverNewsItem {
  title: string;
  /** 원문 링크 — originallink 우선, 없으면 네이버 link */
  link: string;
  /** 발행 시각 ms (정렬용) */
  pubDateMs: number;
  /**
   * 기사 발췌 2~3줄 (Phase 84) — 네이버가 검색어 주변을 잘라 주는 요약문이다.
   * **실적 보도에서는 이 한 문단이 본체다**(임원 발언·수치 해설이 여기 담긴다).
   * 뉴스 탭은 제목만 쓰므로 저장하지 않고, 실적 뉴스(`market:earningsNews:{code}`)만 굳힌다.
   */
  summary: string;
}

function getNaverCredentials(): { id: string; secret: string } {
  const id = process.env.NAVER_CLIENT_ID?.trim() ?? "";
  const secret = process.env.NAVER_CLIENT_SECRET?.trim() ?? "";
  if (id === "" || secret === "") {
    throw new Error("NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 미설정");
  }
  return { id, secret };
}

/** 네이버가 검색어에 씌우는 <b> 태그·HTML 엔티티 제거 */
function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/** 필터·정렬 여유분을 두고 API에서 받아오는 원본 건수 (반환은 display로 컷) */
const NAVER_FETCH_SIZE = 20;

/**
 * 종목명 키워드로 뉴스 조회 — 기본은 최신순(sort=date) 상위 display건.
 *
 * sort=date만으로는 본문에만 종목명이 스치는 저관련 기사가 섞여, 실데이터 확인 결과
 * (§17.13) **제목+요약에 종목명이 실제로 포함된 기사만** 남기는 경량 필터를 둔다.
 * 네이버가 이미 검색어를 제목/본문에서 매칭하므로 대부분 통과하지만, 동명이의
 * 오탐(예: 검색어와 무관한 기사)을 걸러내는 안전망이다. pubDate 파싱 불가 항목도 제외.
 *
 * Phase 84 — 실적 뉴스는 **검색어와 매칭 키워드가 다르다**(쿼리는 `"종목명" "영업이익"`
 * 인데 종목명만으로 걸러야 한다). 그래서 `match`로 필터 키워드를 따로 받고, 정렬도
 * 관련도순(`sim`)을 고를 수 있게 열어 뒀다 — 실측상 발표 직후 `date`는 시황·정치 기사가
 * 앞을 채워 실적 보도가 밀린다.
 */
export async function fetchNaverNews(
  query: string,
  display = 10,
  options: { sort?: "date" | "sim"; match?: string } = {}
): Promise<NaverNewsItem[]> {
  const { id, secret } = getNaverCredentials();
  const { sort = "date", match = query } = options;
  const url = `${NAVER_NEWS_URL}?query=${encodeURIComponent(
    query
  )}&display=${NAVER_FETCH_SIZE}&sort=${sort}`;

  const response = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": id,
      "X-Naver-Client-Secret": secret,
    },
    signal: AbortSignal.timeout(NAVER_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`네이버 뉴스 조회 실패 (HTTP ${response.status})`);
  }

  const body = (await response.json()) as NaverNewsResponse;
  const items = body.items ?? [];

  const parsed: NaverNewsItem[] = [];
  for (const item of items) {
    const pubDateMs = Date.parse(item.pubDate);
    if (Number.isNaN(pubDateMs)) {
      continue;
    }
    const title = stripHtml(item.title);
    const summary = stripHtml(item.description);
    // 제목+요약에 종목명이 실제로 있는 기사만 (저관련·오탐 제거)
    if (!`${title} ${summary}`.includes(match)) {
      continue;
    }
    // 원문 링크 우선, 부적합하면 네이버 링크 폴백 — 둘 다 http(s)가 아니면
    // 링크 없는 기사는 쓸모가 없으므로 제외
    const link = toSafeHttpUrl(item.originallink) ?? toSafeHttpUrl(item.link);
    if (link === null) {
      continue;
    }
    parsed.push({ title, link, pubDateMs, summary });
    if (parsed.length >= display) {
      break;
    }
  }

  return parsed;
}
