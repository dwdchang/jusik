import type { MetadataRoute } from "next";

/**
 * PWA 매니페스트 — /manifest.webmanifest 로 서빙된다.
 * iOS는 홈 화면에 추가된 standalone PWA에서만 웹 푸시를 허용하므로
 * display: "standalone"이 알림 기능의 전제 조건이다 (plan.md §10).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "jusik — 국내 지수",
    short_name: "jusik",
    description: "코스피·코스닥 지수 대시보드",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f4f6",
    theme_color: "#3182f6",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        // maskable은 OS가 원형·스퀘어클 등으로 잘라내므로
        // 그래프가 중앙 안전영역 안에 들어간 전용 이미지를 쓴다.
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
