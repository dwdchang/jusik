"use client";

import { useEffect, useState } from "react";
import {
  sendTestPushAction,
  subscribePushAction,
  unsubscribePushAction,
} from "@/app/alerts/actions";
import styles from "./PushSubscriptionManager.module.css";

/**
 * 이 기기의 푸시 구독 on/off + 테스트 발송.
 * VAPID 공개키는 서버 컴포넌트(alerts/page.tsx)가 env를 읽어 prop으로 내려준다 —
 * NEXT_PUBLIC_ 금지 규칙 때문에 클라이언트에서 env를 직접 읽지 않는다.
 */

type SupportState =
  | "checking"
  | "supported"
  | "unsupported"
  | "ios-needs-install"; // iOS는 홈 화면 PWA에서만 푸시 허용

/** applicationServerKey용 — VAPID 공개키(base64url) → Uint8Array */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function PushSubscriptionManager({
  vapidPublicKey,
}: {
  vapidPublicKey: string;
}) {
  const [support, setSupport] = useState<SupportState>("checking");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function detect(): Promise<void> {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isStandalone = window.matchMedia(
        "(display-mode: standalone)"
      ).matches;

      let state: SupportState;
      let hasSubscription = false;

      if (isIos && !isStandalone) {
        state = "ios-needs-install";
      } else if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        state = "unsupported";
      } else {
        state = "supported";
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          const subscription =
            await registration?.pushManager.getSubscription();
          hasSubscription = subscription != null;
        } catch {
          hasSubscription = false;
        }
      }

      if (!cancelled) {
        setSupport(state);
        setSubscribed(hasSubscription);
      }
    }

    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  async function subscribe() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage({
          ok: false,
          text: "알림 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.",
        });
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
      });

      const result = await subscribePushAction(
        subscription.toJSON() as {
          endpoint?: string;
          keys?: { p256dh?: string; auth?: string };
        }
      );

      if (result.ok) {
        setSubscribed(true);
      }
      setMessage({ ok: result.ok, text: result.message });
    } catch (error) {
      console.error("[alerts] subscribe failed:", error);
      setMessage({ ok: false, text: "구독 등록에 실패했습니다." });
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        const result = await unsubscribePushAction(endpoint);
        setMessage({ ok: result.ok, text: result.message });
      }
      setSubscribed(false);
    } catch (error) {
      console.error("[alerts] unsubscribe failed:", error);
      setMessage({ ok: false, text: "구독 해지에 실패했습니다." });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await sendTestPushAction();
      setMessage({ ok: result.ok, text: result.message });
    } finally {
      setBusy(false);
    }
  }

  if (support === "checking") {
    return <p className={styles.hint}>지원 여부 확인 중…</p>;
  }

  if (support === "ios-needs-install") {
    return (
      <div className={styles.guide}>
        <p className={styles.guideTitle}>홈 화면에 추가가 필요합니다</p>
        <p className={styles.guideBody}>
          iPhone·iPad에서는 홈 화면에 추가한 앱에서만 알림을 받을 수 있습니다.
          Safari 하단의 공유 버튼 → <strong>홈 화면에 추가</strong>를 누른 뒤,
          추가된 jusik 앱을 열어 이 화면에서 알림을 켜 주세요.
        </p>
      </div>
    );
  }

  if (support === "unsupported") {
    return (
      <p className={styles.hint}>
        이 브라우저는 웹 푸시 알림을 지원하지 않습니다.
      </p>
    );
  }

  return (
    <div className={styles.manager}>
      <div className={styles.row}>
        <div>
          <p className={styles.rowTitle}>이 기기의 알림</p>
          <p className={styles.rowStatus}>
            {subscribed ? "구독 중" : "꺼짐"}
          </p>
        </div>
        <button
          type="button"
          className={subscribed ? styles.buttonSecondary : styles.buttonPrimary}
          onClick={subscribed ? unsubscribe : subscribe}
          disabled={busy}
        >
          {subscribed ? "알림 끄기" : "알림 켜기"}
        </button>
      </div>

      {subscribed && (
        <button
          type="button"
          className={styles.buttonSecondary}
          onClick={sendTest}
          disabled={busy}
        >
          테스트 알림 보내기
        </button>
      )}

      {message !== null && (
        <p
          className={message.ok ? styles.messageOk : styles.messageError}
          role="status"
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
