import webpush from "web-push";
import {
  getPushSubscriptions,
  prunePushSubscriptions,
} from "@/lib/push/store";

/**
 * 웹 푸시 발송 — 잡(evaluateAlertsHook 등)과 테스트 발송 서버 액션이 공유한다.
 * VAPID 키는 서버 전용 env(VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT).
 * 발송 실패는 개별 구독 단위로 격리하고, 410/404(구독 만료)는 저장소에서 정리한다.
 */

/** sw.js의 push 리스너가 파싱하는 페이로드 계약 */
export interface PushPayload {
  title: string;
  body: string;
  /** 클릭 시 이동할 앱 내 경로 (기본 "/") */
  url?: string;
  /** 같은 tag는 최신 알림으로 교체 — 종목 단위 중복 방지용 */
  tag?: string;
}

export interface PushSendReport {
  /** 발송 성공 수 */
  sent: number;
  /** 만료(410/404)로 정리된 구독 수 */
  pruned: number;
  /** 그 외 실패 수 (일시 오류 — 구독은 유지) */
  failed: number;
}

let vapidConfigured = false;

function ensureVapid(): void {
  if (vapidConfigured) {
    return;
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();

  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT must be configured"
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

/** 구독 만료 — 푸시 서비스가 다시는 받지 않겠다고 확정한 상태 코드 */
function isGoneStatus(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

/**
 * 한 사용자의 모든 구독(기기)에 같은 페이로드를 발송한다.
 * 구독이 없으면 즉시 0 반환 — 호출 측에서 구독 여부를 미리 확인할 필요 없다.
 */
export async function sendPushToEmail(
  email: string,
  payload: PushPayload
): Promise<PushSendReport> {
  ensureVapid();

  const subscriptions = await getPushSubscriptions(email);
  if (subscriptions.length === 0) {
    return { sent: 0, pruned: 0, failed: 0 };
  }

  const body = JSON.stringify(payload);
  const invalidEndpoints: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          body
        );
        sent++;
      } catch (error) {
        const statusCode =
          error instanceof webpush.WebPushError ? error.statusCode : undefined;

        if (isGoneStatus(statusCode)) {
          invalidEndpoints.push(subscription.endpoint);
        } else {
          failed++;
          console.error(
            `[push] send failed (status ${statusCode ?? "?"}):`,
            error instanceof Error ? error.message : error
          );
        }
      }
    })
  );

  await prunePushSubscriptions(email, invalidEndpoints);

  return { sent, pruned: invalidEndpoints.length, failed };
}
