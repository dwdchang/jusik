"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { STOCK_HISTORY_WINDOW_DAYS } from "@/lib/api/kis/constants";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";
import { todayKstDate } from "@/lib/date/kst";
import { getHoldings, saveHoldings } from "@/lib/holdings/store";
import { getWatchlist, saveWatchlist } from "@/lib/watchlist/store";

/**
 * 종목 화면(`/stocks`) Server Actions (§58) — 구 `holdings/actions.ts`와
 * `watchlist/actions.ts`를 라우트 통합에 맞춰 한 파일로 합친 것.
 * **형식 검증만** 하고 KIS는 호출하지 않는다 (§6.4).
 */

async function requireEmail(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;

  if (!email || !isEmailAllowed(email)) {
    redirect("/login");
  }

  return email;
}

function fail(code: string, basePath: string): never {
  redirect(`${basePath}${basePath.includes("?") ? "&" : "?"}error=${code}`);
}

/**
 * 폼이 제출된 탭으로 돌아갈 경로 — 폼의 `mode` 히든값을 화이트리스트로 검사하고
 * **경로는 서버가 직접 조립**한다(입력값을 리다이렉트 경로에 그대로 넣지 않으므로
 * 오픈 리다이렉트 여지 없음). 알 수 없는 값은 기본 탭(모두).
 */
function stocksPath(formData: FormData): string {
  const mode = String(formData.get("mode") ?? "");
  return mode === "holdings" || mode === "watchlist" || mode === "balance"
    ? `/stocks?mode=${mode}`
    : "/stocks";
}

/** 보유종목 상세 경로 — 통합 상세는 `?kind`로 보유/관심을 가른다 (§58) */
function holdingDetailPath(symbolCode: string): string {
  return `/stocks/${symbolCode}?kind=holding`;
}

// ─────────────────────────────────────────────────────────────
// 보유종목
// ─────────────────────────────────────────────────────────────

/** 수량·총 매입금액 — 1주당 평균 매입가는 저장하지 않는다 (plan.md §13.1) */
function parseEditableFields(
  formData: FormData,
  basePath: string
): {
  quantity: number;
  totalCost: number;
} {
  const quantity = Number(String(formData.get("quantity") ?? "").trim());
  const totalCost = Number(String(formData.get("totalCost") ?? "").trim());

  if (!Number.isInteger(quantity) || quantity <= 0) {
    fail("invalid_quantity", basePath);
  }
  if (!Number.isFinite(totalCost) || totalCost <= 0) {
    fail("invalid_total_cost", basePath);
  }

  return { quantity, totalCost };
}

export async function addHoldingAction(formData: FormData): Promise<void> {
  const email = await requireEmail();
  const returnPath = stocksPath(formData);
  const symbolCode = String(formData.get("symbolCode") ?? "").trim();

  if (!/^\d{6}$/.test(symbolCode)) {
    fail("invalid_code", returnPath);
  }

  const { quantity, totalCost } = parseEditableFields(formData, returnPath);

  const holdings = await getHoldings(email);

  // 상세 페이지가 종목코드 단위이므로 동일 종목 중복 등록은 막는다 (plan.md §13.3)
  if (holdings.some((holding) => holding.symbolCode === symbolCode)) {
    fail("duplicate_code", returnPath);
  }

  // KIS 실존 검증·종목명 조회·히스토리 백필은 하지 않는다 — 사용자 액션은 임의 시각에
  // 발생해 KIS 허용 시간 규칙과 충돌하므로 형식 검증만 수행하고, 종목명·시세·히스토리는
  // 다음 갱신 회차에서 잡이 채운다. 잘못된 코드는 「시세 없음」으로 표기된다 (§11.10-A4).
  const now = new Date().toISOString();

  holdings.push({
    id: crypto.randomUUID(),
    symbolCode,
    name: "",
    quantity,
    totalCost,
    createdAt: now,
    updatedAt: now,
  });

  await saveHoldings(email, holdings);
  revalidatePath("/stocks");
  redirect(returnPath);
}

export async function updateHoldingAction(formData: FormData): Promise<void> {
  const email = await requireEmail();
  const id = String(formData.get("id") ?? "");

  const holdings = await getHoldings(email);
  const target = holdings.find((holding) => holding.id === id);

  if (!target) {
    fail("not_found", "/stocks?mode=balance");
  }

  const detailPath = holdingDetailPath(target.symbolCode);
  const { quantity, totalCost } = parseEditableFields(formData, detailPath);

  target.quantity = quantity;
  target.totalCost = totalCost;
  target.updatedAt = new Date().toISOString();

  await saveHoldings(email, holdings);
  revalidatePath("/stocks");
  revalidatePath(`/stocks/${target.symbolCode}`);
  redirect(detailPath);
}

export async function deleteHoldingAction(formData: FormData): Promise<void> {
  const email = await requireEmail();
  const id = String(formData.get("id") ?? "");

  const holdings = await getHoldings(email);
  const next = holdings.filter((holding) => holding.id !== id);

  if (next.length === holdings.length) {
    fail("not_found", "/stocks?mode=balance");
  }

  await saveHoldings(email, next);
  revalidatePath("/stocks");
  redirect("/stocks?mode=balance");
}

// ─────────────────────────────────────────────────────────────
// 관심종목
// ─────────────────────────────────────────────────────────────

/** "YYYY-MM-DD"에 일수를 더한 "YYYY-MM-DD" (달력일 기준) */
function addDaysIsoDate(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * 등록 기준일 — 오늘 이하 & 최근 2년 이내 (§15.4).
 * 히스토리 저장 범위(STOCK_HISTORY_WINDOW_DAYS) 밖 날짜는 기준가를 영영
 * 확정할 수 없으므로 등록 단계에서 차단한다.
 */
function parseRegisteredAt(formData: FormData, basePath: string): string {
  const registeredAt = String(formData.get("registeredAt") ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(registeredAt)) {
    fail("invalid_date", basePath);
  }

  const parsed = new Date(`${registeredAt}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== registeredAt
  ) {
    fail("invalid_date", basePath);
  }

  const today = todayKstDate();
  if (registeredAt > today) {
    fail("future_date", basePath);
  }
  if (registeredAt < addDaysIsoDate(today, -STOCK_HISTORY_WINDOW_DAYS)) {
    fail("too_old_date", basePath);
  }

  return registeredAt;
}

export async function addWatchItemAction(formData: FormData): Promise<void> {
  const email = await requireEmail();
  const basePath = stocksPath(formData);
  const symbolCode = String(formData.get("symbolCode") ?? "").trim();

  if (!/^\d{6}$/.test(symbolCode)) {
    fail("invalid_code", basePath);
  }

  const registeredAt = parseRegisteredAt(formData, basePath);
  const items = await getWatchlist(email);

  // 상세 페이지가 종목코드 단위이므로 동일 종목 중복 등록은 막는다
  if (items.some((item) => item.symbolCode === symbolCode)) {
    fail("duplicate_code", basePath);
  }

  // KIS 실존 검증·종목명 조회·기준가 확정은 하지 않는다 — 사용자 액션은 임의 시각에
  // 발생해 KIS 허용 시간 규칙과 충돌하므로 형식 검증만 수행하고, 종목명은 잡이
  // 채우고 기준가는 잡이 stock:{code}:history에서 확정한다 (§15.4, §11.10-A4).
  const now = new Date().toISOString();

  items.push({
    id: crypto.randomUUID(),
    symbolCode,
    name: "",
    registeredAt,
    priceAtRegistration: null,
    priceBasisDate: null,
    createdAt: now,
    updatedAt: now,
  });

  await saveWatchlist(email, items);
  revalidatePath("/stocks");
  redirect(basePath);
}

export async function updateWatchItemAction(formData: FormData): Promise<void> {
  const email = await requireEmail();
  const basePath = stocksPath(formData);
  const id = String(formData.get("id") ?? "");

  const items = await getWatchlist(email);
  const target = items.find((item) => item.id === id);

  // 편집 폼은 행 펼침 안에 있으므로 오류 시에도 같은 탭으로 돌려보낸다 (§56)
  if (!target) {
    fail("not_found", basePath);
  }

  const registeredAt = parseRegisteredAt(formData, basePath);

  // 기준일이 바뀌면 기준가를 null로 리셋 — 다음 갱신 회차에서 잡이 재확정 (§15.4)
  target.registeredAt = registeredAt;
  target.priceAtRegistration = null;
  target.priceBasisDate = null;
  target.updatedAt = new Date().toISOString();

  await saveWatchlist(email, items);
  revalidatePath("/stocks");
  revalidatePath(`/stocks/${target.symbolCode}`);
  redirect(basePath);
}

export async function deleteWatchItemAction(formData: FormData): Promise<void> {
  const email = await requireEmail();
  const basePath = stocksPath(formData);
  const id = String(formData.get("id") ?? "");

  const items = await getWatchlist(email);
  const next = items.filter((item) => item.id !== id);

  if (next.length === items.length) {
    fail("not_found", basePath);
  }

  await saveWatchlist(email, next);
  revalidatePath("/stocks");
  redirect(basePath);
}
