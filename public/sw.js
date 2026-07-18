/**
 * 서비스 워커 — 웹 푸시 수신·클릭 처리 전용 (오프라인 캐싱 없음).
 * 페이로드는 서버(lib/push/send.ts)가 보내는 JSON:
 *   { title: string, body: string, url?: string, tag?: string }
 * tag가 같은 알림은 최신 것으로 교체된다(같은 종목 중복 알림 방지).
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    payload = null;
  }

  const title = (payload && payload.title) || "jusik";
  const options = {
    body: (payload && payload.body) || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: (payload && payload.url) || "/" },
  };
  if (payload && payload.tag) {
    options.tag = payload.tag;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        for (const client of windows) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
