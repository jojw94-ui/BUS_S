// 추천 함수를 한 곳에서 고른다.
// core 담당이 packages/core 에 recommend 를 구현하면 그것을 쓰고, 아직 없으면 아래 임시 구현을 쓴다.
// 임시 구현은 "가장 빨리 오는 버스 순"일 뿐 혼잡도·다음 차 판단이 없다. core 완성 후 이 파일의 임시 부분은 삭제한다.
import * as core from '@bus-s/core';
import type { Candidate, Recommendation, RecommendInput } from '@bus-s/core';

type RecommendFn = (input: RecommendInput) => Recommendation;

const coreRecommend = (core as unknown as { recommend?: RecommendFn }).recommend;

/** true 면 core 의 실제 추천 로직을 쓰는 중 */
export const usingCoreRecommend = typeof coreRecommend === 'function';

export const recommend: RecommendFn = usingCoreRecommend ? coreRecommend! : tempRecommend;

/** 임시 구현: 출발 → 도착 순서로 지나는 노선의 버스를 첫 버스 etaMin 순으로 나열 */
export function tempRecommend(input: RecommendInput): Recommendation {
  const { segment, arrivals, routes, config } = input;
  const candidates: Candidate[] = [];

  for (const a of arrivals) {
    if (!segment.fromStopIds.includes(a.stopId)) continue;
    if (segment.routeFilter.length > 0 && !segment.routeFilter.includes(a.routeNo)) continue;
    const route = routes[a.routeId];
    if (!route) continue; // 경유 정류장을 모르면 도착 정류장으로 가는지 판단할 수 없다

    // 출발 정류장 이후에 나오는 도착 정류장 중 가장 가까운 것
    const target = route.stops
      .filter((s) => segment.toStopIds.includes(s.stopId) && s.seq > a.stopSeq)
      .sort((x, y) => x.seq - y.seq)[0];
    if (!target) continue;

    const walk = segment.walkMin[a.stopId] ?? 0;
    const rideStops = target.seq - a.stopSeq;
    const rideMin = config?.minPerStop ? rideStops * config.minPerStop : 0;
    a.buses.forEach((bus, i) => {
      if (i > 1 || bus.etaMin < walk || bus.etaMin > segment.maxWaitMin) return;
      candidates.push({
        routeId: a.routeId,
        routeNo: a.routeNo,
        fromStopId: a.stopId,
        toStopId: target.stopId,
        bus,
        busIndex: i as 0 | 1,
        rideStops,
        rideMin,
        totalMin: bus.etaMin + rideMin,
        congestion: { level: 0, baseline: null, gapRatio: null, estimated: true },
      });
    });
  }

  candidates.sort((x, y) => x.bus.etaMin - y.bus.etaMin);
  const best = candidates[0] ?? null;
  return {
    best,
    waitForNext: null,
    reason: best
      ? `임시 추천(가장 빨리 오는 버스): ${best.routeNo}번 · ${best.bus.etaMin}분 후 도착 · ${best.rideStops}정류장`
      : '조건에 맞는 버스가 없습니다 (최대 대기시간·도보시간·노선을 확인하세요)',
    candidates,
  };
}
