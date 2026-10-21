// 앱 동작 설정. 추천 기준값(혼잡도 단계·다음 차 허용 시간 등)은 core 의 RecommendConfig 가 담당하고,
// 여기에는 제안서에 이미 정해진 값과 앱 내부 동작값만 둔다.

/** 도착정보 메모리 캐시 유효시간 — 제안서: 15~30초 */
export const ARRIVAL_CACHE_TTL_MS = 20_000;
/** 노선 정보(경유 정류장·배차) 캐시 — 거의 바뀌지 않으므로 길게 */
export const ROUTE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** 정류장 검색 결과 캐시 */
export const STOP_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
/** 화면이 켜져 있을 때 자동 새로고침 간격 — 제안서: 30초 */
export const REFRESH_INTERVAL_MS = 30_000;
/** GPS 근처 정류장 반경 — 제안서: 300m */
export const NEARBY_RADIUS_M = 300;
/** 새 구간의 최대 대기시간 기본값 — 제안서: 기본 10분 */
export const DEFAULT_MAX_WAIT_MIN = 10;
/** 새 정류장의 도보시간 기본값 — 사용자가 직접 입력 */
export const DEFAULT_WALK_MIN = 0;
