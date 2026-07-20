import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Phase 2: 대시보드 다중 API 호출 시 SSG 제한 시간 확대 */
  staticPageGenerationTimeout: 300,

  experimental: {
    /**
     * 동적 라우트 클라이언트 캐시 TTL. 기본 0초라 뒤로가기마다 전량 서버 재요청이 발생한다.
     * 시세 원본이 QStash 잡으로 10분마다만 갱신돼 30초 캐시의 신선도 손실은 사실상 0이고,
     * 뒤로가기 시 서버 왕복을 건너뛰어 즉시 전환된다. static은 기본값(5분) 유지.
     */
    staleTimes: {
      dynamic: 30,
    },
  },

  async headers() {
    return [
      {
        // 서비스 워커는 캐시가 남으면 푸시 로직 수정이 기기에 전파되지 않는다 (Phase 10)
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
