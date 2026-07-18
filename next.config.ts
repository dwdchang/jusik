import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Phase 2: 대시보드 다중 API 호출 시 SSG 제한 시간 확대 */
  staticPageGenerationTimeout: 300,

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
