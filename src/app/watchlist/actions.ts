"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { STOCK_HISTORY_WINDOW_DAYS } from "@/lib/api/kis/constants";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";
import { todayKstDate } from "@/lib/date/kst";
import { getWatchlist, saveWatchlist } from "@/lib/watchlist/store";

async function requireEmail(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;

  if (!email || !isEmailAllowed(email)) {
    redirect("/login");
  }

  return email;
}

function fail(code: string, basePath = "/watchlist"): never {
  redirect(`${basePath}?error=${code}`);
}

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
  const symbolCode = String(formData.get("symbolCode") ?? "").trim();

  if (!/^\d{6}$/.test(symbolCode)) {
    fail("invalid_code");
  }

  const registeredAt = parseRegisteredAt(formData, "/watchlist");
  const items = await getWatchlist(email);

  // 상세 페이지가 종목코드 단위이므로 동일 종목 중복 등록은 막는다
  if (items.some((item) => item.symbolCode === symbolCode)) {
    fail("duplicate_code");
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
  revalidatePath("/watchlist");
  redirect("/watchlist");
}

export async function updateWatchItemAction(formData: FormData): Promise<void> {
  const email = await requireEmail();
  const id = String(formData.get("id") ?? "");

  const items = await getWatchlist(email);
  const target = items.find((item) => item.id === id);

  if (!target) {
    fail("not_found");
  }

  const registeredAt = parseRegisteredAt(formData, "/watchlist");

  // 기준일이 바뀌면 기준가를 null로 리셋 — 다음 갱신 회차에서 잡이 재확정 (§15.4)
  target.registeredAt = registeredAt;
  target.priceAtRegistration = null;
  target.priceBasisDate = null;
  target.updatedAt = new Date().toISOString();

  await saveWatchlist(email, items);
  revalidatePath("/watchlist");
  revalidatePath(`/watchlist/${target.symbolCode}`);
  redirect("/watchlist");
}

export async function deleteWatchItemAction(formData: FormData): Promise<void> {
  const email = await requireEmail();
  const id = String(formData.get("id") ?? "");

  const items = await getWatchlist(email);
  const next = items.filter((item) => item.id !== id);

  if (next.length === items.length) {
    fail("not_found");
  }

  await saveWatchlist(email, next);
  revalidatePath("/watchlist");
  redirect("/watchlist");
}
