import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Phase 2: 대시보드 다중 API 호출 시 SSG 제한 시간 확대 */
  staticPageGenerationTimeout: 300,
};

export default nextConfig;
