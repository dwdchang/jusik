"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getMutedSymbols,
  saveMutedSymbols,
} from "@/lib/alerts/store";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";
import { getHoldings } from "@/lib/holdings/store";
import { sendPushToEmail } from "@/lib/push/send";
import {
  addPushSubscription,
  removePushSubscription,
} from "@/lib/push/store";

async function requireEmail(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;

  if (!email || !isEmailAllowed(email)) {
    redirect("/login");
  }

  return email;
}

/** 클라이언트 PushSubscription.toJSON() 결과 — 신뢰하지 않고 형식 검증한다 */
interface SubscriptionInput {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

function parseSubscription(input: SubscriptionInput): {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} | null {
  const endpoint = typeof input.endpoint === "string" ? input.endpoint : "";
  const p256dh = typeof input.keys?.p256dh === "string" ? input.keys.p256dh : "";
  const authKey = typeof input.keys?.auth === "string" ? input.keys.auth : "";

  if (!endpoint.startsWith("https://") || p256dh === "" || authKey === "") {
    return null;
  }

  return { endpoint, keys: { p256dh, auth: authKey } };
}

export interface PushActionResult {
  ok: boolean;
  message: string;
}

export async function subscribePushAction(
  input: SubscriptionInput
): Promise<PushActionResult> {
  const email = await requireEmail();
  const subscription = parseSubscription(input);

  if (subscription === null) {
    return { ok: false, message: "구독 정보 형식이 올바르지 않습니다." };
  }

  await addPushSubscription(email, subscription);
  revalidatePath("/alerts");
  return { ok: true, message: "이 기기의 알림 구독을 등록했습니다." };
}

export async function unsubscribePushAction(
  endpoint: string
): Promise<PushActionResult> {
  const email = await requireEmail();

  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) {
    return { ok: false, message: "구독 정보 형식이 올바르지 않습니다." };
  }

  await removePushSubscription(email, endpoint);
  revalidatePath("/alerts");
  return { ok: true, message: "이 기기의 알림 구독을 해지했습니다." };
}

/**
 * 종목별 알림 on/off — enabled=false면 음소거 목록에 추가한다.
 * 음소거 목록은 시세(2단계)·공시(3단계) 알림이 공유한다.
 */
export async function setStockAlertEnabledAction(
  symbolCode: string,
  enabled: boolean
): Promise<PushActionResult> {
  const email = await requireEmail();

  if (typeof symbolCode !== "string" || !/^[A-Za-z0-9]{6}$/.test(symbolCode)) {
    return { ok: false, message: "종목코드 형식이 올바르지 않습니다." };
  }

  // 내 보유종목만 토글 허용 — 임의 코드로 목록이 오염되는 것을 방지
  const holdings = await getHoldings(email);
  if (!holdings.some((holding) => holding.symbolCode === symbolCode)) {
    return { ok: false, message: "보유종목이 아닙니다." };
  }

  const muted = await getMutedSymbols(email);
  const next = enabled
    ? muted.filter((code) => code !== symbolCode)
    : [...new Set([...muted, symbolCode])];

  await saveMutedSymbols(email, next);
  revalidatePath("/alerts");
  return {
    ok: true,
    message: enabled
      ? "이 종목의 알림을 켰습니다."
      : "이 종목의 알림을 껐습니다.",
  };
}

export async function sendTestPushAction(): Promise<PushActionResult> {
  const email = await requireEmail();

  try {
    const report = await sendPushToEmail(email, {
      title: "jusik 테스트 알림",
      body: "알림이 정상적으로 도착했습니다.",
      url: "/alerts",
      tag: "test",
    });

    if (report.sent === 0) {
      return {
        ok: false,
        message:
          report.pruned > 0
            ? "만료된 구독만 있어 정리했습니다. 다시 구독해 주세요."
            : "등록된 구독이 없습니다. 먼저 이 기기에서 알림을 켜 주세요.",
      };
    }

    revalidatePath("/alerts");
    return {
      ok: true,
      message: `${report.sent}개 기기로 테스트 알림을 보냈습니다.`,
    };
  } catch (error) {
    console.error("[alerts] test push failed:", error);
    return { ok: false, message: "테스트 발송에 실패했습니다." };
  }
}
