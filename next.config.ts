import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Phase 2: 대시보드 다중 API 호출 시 SSG 제한 시간 확대 */
  staticPageGenerationTimeout: 300,

  experimental: {
    /**
     * 동적 라우트 클라이언트 캐시 TTL. 기본 0초라 뒤로가기마다 전량 서버 재요청이 발생한다.
     * 시세 원본이 QStash 잡으로 10분 간격에만 갱신되므로, 30초(Phase 48)는 갱신 주기의
     * 1/20만 덮어 캐시 이득 대부분을 버리고 있었다 → **갱신 간격과 같은 600초**로 확대 (Phase 77).
     *
     * "다음 갱신까지 남은 시간만큼만 유지"는 이 설정으로 표현할 수 없다 — staleTimes는
     * 빌드타임 고정값이고 요청·시각별로 계산해 넣을 훅이 없다. 대신 그 의도는
     * `components/ui/AutoRefresh`가 담당한다: 예정 회차가 지나면 실제 갱신을 확인해
     * 클라이언트 캐시를 통째로 버리므로, TTL이 길어도 묵은 값이 남지 않는다.
     * static은 기본값(5분) 유지.
     */
    staleTimes: {
      dynamic: 600,
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
