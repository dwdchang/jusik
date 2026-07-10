"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { fetchKisStockName, fetchKisStockPrice } from "@/lib/api/kis/client";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";
import { getHoldings, saveHoldings } from "@/lib/holdings/store";
import { backfillStockHistoryIfMissing } from "@/lib/holdings/stockHistory";

async function requireEmail(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;

  if (!email || !isEmailAllowed(email)) {
    redirect("/login");
  }

  return email;
}

function fail(code: string, basePath = "/holdings"): never {
  redirect(`${basePath}?error=${code}`);
}

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
  const symbolCode = String(formData.get("symbolCode") ?? "").trim();

  if (!/^\d{6}$/.test(symbolCode)) {
    fail("invalid_code");
  }

  const { quantity, totalCost } = parseEditableFields(formData, "/holdings");

  const holdings = await getHoldings(email);

  // 상세 페이지가 종목코드 단위이므로 동일 종목 중복 등록은 막는다 (plan.md §13.3)
  if (holdings.some((holding) => holding.symbolCode === symbolCode)) {
    fail("duplicate_code");
  }

  // 실존 검증(현재가) + 종목명 자동 조회 — 어느 쪽이든 실패하면 저장하지 않는다
  let name: string;
  try {
    const [, fetchedName] = await Promise.all([
      fetchKisStockPrice(symbolCode),
      fetchKisStockName(symbolCode),
    ]);
    name = fetchedName;
  } catch (error) {
    console.error(`[addHoldingAction] stock lookup failed (${symbolCode}):`, error);
    fail("stock_lookup_failed");
  }

  const now = new Date().toISOString();

  holdings.push({
    id: crypto.randomUUID(),
    symbolCode,
    name,
    quantity,
    totalCost,
    createdAt: now,
    updatedAt: now,
  });

  await saveHoldings(email, holdings);

  // 종목별 히스토리 백필 — 이미 저장된 종목은 재사용, 실패해도 등록 자체는 유지 (plan.md §13.3)
  try {
    await backfillStockHistoryIfMissing(symbolCode);
  } catch (error) {
    console.error(
      `[addHoldingAction] history backfill failed (${symbolCode}):`,
      error
    );
  }

  revalidatePath("/holdings");
  redirect("/holdings");
}

export async function updateHoldingAction(formData: FormData): Promise<void> {
  const email = await requireEmail();
  const id = String(formData.get("id") ?? "");

  const holdings = await getHoldings(email);
  const target = holdings.find((holding) => holding.id === id);

  if (!target) {
    fail("not_found");
  }

  const detailPath = `/holdings/${target.symbolCode}`;
  const { quantity, totalCost } = parseEditableFields(formData, detailPath);

  target.quantity = quantity;
  target.totalCost = totalCost;
  target.updatedAt = new Date().toISOString();

  await saveHoldings(email, holdings);
  revalidatePath("/holdings");
  revalidatePath(detailPath);
  redirect(detailPath);
}

export async function deleteHoldingAction(formData: FormData): Promise<void> {
  const email = await requireEmail();
  const id = String(formData.get("id") ?? "");

  const holdings = await getHoldings(email);
  const next = holdings.filter((holding) => holding.id !== id);

  if (next.length === holdings.length) {
    fail("not_found");
  }

  await saveHoldings(email, next);
  revalidatePath("/holdings");
  redirect("/holdings");
}
