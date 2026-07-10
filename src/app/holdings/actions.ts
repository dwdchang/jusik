"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { fetchKisStockPrice } from "@/lib/api/kis/client";
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

function fail(code: string): never {
  redirect(`/holdings?error=${code}`);
}

function parseEditableFields(formData: FormData): {
  name: string;
  quantity: number;
  avgPrice: number;
} {
  const name = String(formData.get("name") ?? "").trim();
  const quantity = Number(String(formData.get("quantity") ?? "").trim());
  const avgPrice = Number(String(formData.get("avgPrice") ?? "").trim());

  if (name.length === 0 || name.length > 50) {
    fail("invalid_name");
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    fail("invalid_quantity");
  }
  if (!Number.isFinite(avgPrice) || avgPrice <= 0) {
    fail("invalid_price");
  }

  return { name, quantity, avgPrice };
}

export async function addHoldingAction(formData: FormData): Promise<void> {
  const email = await requireEmail();
  const symbolCode = String(formData.get("symbolCode") ?? "").trim();

  if (!/^\d{6}$/.test(symbolCode)) {
    fail("invalid_code");
  }

  const { name, quantity, avgPrice } = parseEditableFields(formData);

  // 실존 여부 검증 — 현재가 조회 실패 시 저장하지 않는다
  try {
    await fetchKisStockPrice(symbolCode);
  } catch (error) {
    console.error(`[addHoldingAction] price check failed (${symbolCode}):`, error);
    fail("price_check_failed");
  }

  const now = new Date().toISOString();
  const holdings = await getHoldings(email);

  holdings.push({
    id: crypto.randomUUID(),
    symbolCode,
    name,
    quantity,
    avgPrice,
    createdAt: now,
    updatedAt: now,
  });

  await saveHoldings(email, holdings);
  revalidatePath("/holdings");
  redirect("/holdings");
}

export async function updateHoldingAction(formData: FormData): Promise<void> {
  const email = await requireEmail();
  const id = String(formData.get("id") ?? "");
  const { name, quantity, avgPrice } = parseEditableFields(formData);

  const holdings = await getHoldings(email);
  const target = holdings.find((holding) => holding.id === id);

  if (!target) {
    fail("not_found");
  }

  target.name = name;
  target.quantity = quantity;
  target.avgPrice = avgPrice;
  target.updatedAt = new Date().toISOString();

  await saveHoldings(email, holdings);
  revalidatePath("/holdings");
  redirect("/holdings");
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
