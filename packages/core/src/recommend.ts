import { resolveConfig } from './config';
import { CONGESTION_LABELS, estimateCongestion } from './congestion';
import type {
  Arrival,
  ArrivalBus,
  Candidate,
  CommuteSegment,
  Recommendation,
  RecommendConfig,
  RecommendInput,
  Route,
  StopId,
} from './types';

/** routeFilter 는 노선 번호(lineno) 또는 노선 ID(lineid) 둘 다 받는다 */
function passesFilter(route: Route, filter: string[]): boolean {
  return filter.length === 0 || filter.includes(route.no) || filter.includes(route.id);
}

/**
 * 노선에서 출발 정류장 순번 → 그보다 뒤에 있는 도착 정류장 순번.
 * 출발 순번은 도착정보의 stopSeq 를 우선 쓰고(순환 노선 대비), 맞지 않으면 노선 정류장 목록에서 찾는다.
 * 같은 방향으로 지나지 않으면 null.
 */
function rideSeqs(
  route: Route,
  fromStopId: StopId,
  toStopId: StopId,
  hintFromSeq?: number,
): { fromSeq: number; toSeq: number } | null {
  const fromSeqs = route.stops.filter((s) => s.stopId === fromStopId).map((s) => s.seq);
  if (fromSeqs.length === 0) return null;
  const candidates =
    hintFromSeq !== undefined && fromSeqs.includes(hintFromSeq) ? [hintFromSeq] : fromSeqs;
  for (const fromSeq of candidates) {
    const toSeq = route.stops
      .filter((s) => s.stopId === toStopId && s.seq > fromSeq)
      .reduce<number | null>((min, s) => (min === null || s.seq < min ? s.seq : min), null);
    if (toSeq !== null) return { fromSeq, toSeq };
  }
  return null;
}

function hasAnyRoute(segment: CommuteSegment, routes: Record<string, Route>): boolean {
  return Object.values(routes).some(
    (route) =>
      passesFilter(route, segment.routeFilter) &&
      segment.fromStopIds.some((from) =>
        segment.toStopIds.some((to) => rideSeqs(route, from, to) !== null),
      ),
  );
}

function compareCandidates(a: Candidate, b: Candidate): number {
  return (
    a.congestion.level - b.congestion.level ||
    a.totalMin - b.totalMin ||
    a.bus.etaMin - b.bus.etaMin ||
    a.routeNo.localeCompare(b.routeNo, 'ko', { numeric: true }) ||
    a.fromStopId.localeCompare(b.fromStopId) ||
    a.toStopId.localeCompare(b.toStopId)
  );
}

interface PairResult {
  /** 지금 탈 수 있는 첫 버스 */
  first: Candidate;
  /** 그 다음 버스 (탈 수 있을 때만) */
  next: Candidate | null;
}

function buildPair(
  arrival: Arrival,
  route: Route,
  toStopId: StopId,
  segment: CommuteSegment,
  input: RecommendInput,
  config: RecommendConfig,
): PairResult | null {
  const seqs = rideSeqs(route, arrival.stopId, toStopId, arrival.stopSeq);
  if (!seqs) return null;

  const buses: ArrivalBus[] = [...arrival.buses].sort((a, b) => a.etaMin - b.etaMin).slice(0, 2);
  const walk = segment.walkMin[arrival.stopId] ?? 0;
  const rideStops = seqs.toSeq - seqs.fromSeq;
  const rideMin = rideStops * config.minPerStop;

  const eligible: Candidate[] = [];
  buses.forEach((bus, i) => {
    if (bus.etaMin > segment.maxWaitMin || bus.etaMin < walk) return;
    const busIndex = i as 0 | 1;
    eligible.push({
      routeId: route.id,
      routeNo: route.no,
      fromStopId: arrival.stopId,
      toStopId,
      bus,
      busIndex,
      rideStops,
      rideMin,
      totalMin: bus.etaMin + rideMin,
      congestion: estimateCongestion({
        route,
        stopSeq: seqs.fromSeq,
        buses,
        busIndex,
        profile: input.profile,
        now: input.now,
        config,
      }),
    });
  });

  if (eligible.length === 0) return null;
  return { first: eligible[0], next: eligible[1] ?? null };
}

function etaText(etaMin: number): string {
  return etaMin <= 0 ? '곧 도착' : `${etaMin}분 후 도착`;
}

function label(c: Candidate): string {
  return `추정 ${CONGESTION_LABELS[c.congestion.level]}`;
}

function reasonFor(best: Candidate, waitForNext: Candidate | null): string {
  if (waitForNext) {
    const extra = waitForNext.bus.etaMin - best.bus.etaMin;
    return (
      `${best.routeNo}번 다음 차 추천 · 앞차 ${label(best)}, ${extra}분 더 기다리면 ${label(waitForNext)}` +
      ` · ${etaText(waitForNext.bus.etaMin)} · ${waitForNext.rideMin}분 소요`
    );
  }
  const base = `${best.routeNo}번 ${label(best)} · ${etaText(best.bus.etaMin)} · ${best.rideMin}분 소요`;
  return best.congestion.level >= 2 ? `${base} · 모든 후보가 혼잡 예상` : base;
}

export function recommend(input: RecommendInput): Recommendation {
  const config = resolveConfig(input.config);
  const { segment, routes } = input;

  const pairs: PairResult[] = [];
  let anyBus = false;
  for (const arrival of input.arrivals) {
    if (!segment.fromStopIds.includes(arrival.stopId)) continue;
    const route = routes[arrival.routeId];
    if (!route || !passesFilter(route, segment.routeFilter)) continue;
    for (const toStopId of segment.toStopIds) {
      if (rideSeqs(route, arrival.stopId, toStopId, arrival.stopSeq) && arrival.buses.length > 0) {
        anyBus = true;
      }
      const pair = buildPair(arrival, route, toStopId, segment, input, config);
      if (pair) pairs.push(pair);
    }
  }

  pairs.sort((a, b) => compareCandidates(a.first, b.first));
  const candidates = pairs.map((p) => p.first);

  if (candidates.length === 0) {
    let reason: string;
    if (!hasAnyRoute(segment, routes)) {
      reason = '두 정류장을 같은 방향으로 지나는 노선이 없습니다. 정류장 방향과 이용 노선 설정을 확인하세요.';
    } else if (!anyBus) {
      reason = '지금 도착 예정인 버스가 없습니다.';
    } else {
      reason = `최대 대기 ${segment.maxWaitMin}분 안에 걸어가서 탈 수 있는 버스가 없습니다.`;
    }
    return { best: null, waitForNext: null, reason, candidates: [] };
  }

  const best = candidates[0];
  const next = pairs[0].next;
  const waitForNext =
    next &&
    next.congestion.level < best.congestion.level &&
    next.bus.etaMin - best.bus.etaMin <= config.nextBusExtraWaitMin
      ? next
      : null;

  return { best, waitForNext, reason: reasonFor(best, waitForNext), candidates };
}
