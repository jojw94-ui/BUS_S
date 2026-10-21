// 추천 입력용 노선 정보 모으기.
// TODO: data/static/routes.json 이 생기면 정적 데이터를 먼저 쓰고, 없는 노선만 API 로 채운다.
import type { Route, RouteId, StopId } from '@bus-s/core';
import { getRoute } from '../api/bims';

/** 노선 여러 개를 병렬로 조회. 실패한 노선은 빠진다. */
export async function loadRoutes(routeIds: RouteId[]): Promise<Record<RouteId, Route>> {
  const unique = [...new Set(routeIds.filter(Boolean))];
  const results = await Promise.allSettled(unique.map((id) => getRoute(id)));
  const out: Record<RouteId, Route> = {};
  results.forEach((r) => {
    if (r.status === 'fulfilled' && r.value) out[r.value.id] = r.value;
  });
  return out;
}

/**
 * "OO 방면" — 이 정류장을 지나는 노선들의 다음 정류장 이름.
 * seq 는 도착정보의 bstopidx (같은 이름의 반대편 정류장과 구분하기 위해 ID+순번으로 찾는다).
 */
export function towardsNames(
  stopId: StopId,
  arrivals: { routeId: RouteId; stopSeq: number }[],
  routes: Record<RouteId, Route>,
): string[] {
  const counts = new Map<string, number>();
  for (const a of arrivals) {
    const route = routes[a.routeId];
    if (!route) continue;
    const idx = route.stops.findIndex((s) => s.stopId === stopId && s.seq === a.stopSeq);
    const next = idx >= 0 ? route.stops[idx + 1] : undefined;
    if (next && next.stopId !== stopId) counts.set(next.name, (counts.get(next.name) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}
