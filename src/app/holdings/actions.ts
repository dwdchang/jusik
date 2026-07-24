"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";
import { getHoldings, saveHoldings } from "@/lib/holdings/store";

async function requireEmail(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;

  if (!email || !isEmailAllowed(email)) {
    redirect("/login");
  }

  return email;
}

function fail(code: string, basePath = "/holdings"): never {
  redirect(`${basePath}${basePath.includes("?") ? "&" : "?"}error=${code}`);
}

/**
 * 추가 폼이 어느 화면에서 왔는지 (§56) — 종목 목록 화면(`/watchlist`)의 보유종목
 * 탭에도 같은 추가 폼이 있어, 거기서 온 제출은 그 탭으로 돌려보낸다.
 * 폼 값은 불리언 플래그로만 쓰고 경로는 서버가 조립한다(경로 주입 없음).
 */
function addReturnPath(formData: FormData): string {
  return String(formData.get("from") ?? "") === "watchlist"
    ? "/watchlist?mode=holdings"
    : "/holdings";
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
  const returnPath = addReturnPath(formData);
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
  revalidatePath("/holdings");
  revalidatePath("/watchlist");
  redirect(returnPath);
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
  // 종목 목록 화면(§56)도 보유종목을 보여주므로 함께 무효화
  revalidatePath("/watchlist");
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
  revalidatePath("/watchlist");
  redirect("/holdings");
}
