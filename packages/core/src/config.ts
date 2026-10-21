import type { RecommendConfig } from './types';

/**
 * 추천 기준값 기본값 — **임시값**이다. 사용자 확인 전까지 바꾸지 말고,
 * 근거와 확인 요청은 docs/reports/core.md 참고.
 * 앱 설정(RecommendInput.config)으로 항목별로 덮어쓸 수 있다.
 */
export const DEFAULT_RECOMMEND_CONFIG: RecommendConfig = {
  // 제안서 3장 5번 "추가 대기가 허용 범위(기본 5분) 이내"
  nextBusExtraWaitMin: 5,
  // 임시값. 부산 시내버스 정류장 간 평균 1.5~2분 수준으로 가정
  minPerStop: 2,
  // docs/api-notes/congestion.md 대체안 A의 초기값: 0.7 미만 여유, ~1.3 보통, ~1.8 혼잡, 그 이상 매우혼잡
  gapRatioThresholds: [0.7, 1.3, 1.8],
  // 임시값. 시내버스 좌석 약 25석, 입석 포함 정원 약 65명 기준 (재차인원 추정치, 명)
  baselineThresholds: [25, 45, 65],
};

export function resolveConfig(override?: Partial<RecommendConfig>): RecommendConfig {
  return { ...DEFAULT_RECOMMEND_CONFIG, ...override };
}
