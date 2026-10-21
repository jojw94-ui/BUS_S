import type { CommuteSegment, Direction, LatLng, Schedule, Stop, StopId } from './types';

/** 반대 방향 정류장을 찾는 반경(m) — 길 건너편 정류장이 들어오는 거리 */
export const REVERSE_STOP_RADIUS_M = 150;
/** 원래 정류장 하나당 반대 방향 출발 후보 정류장 최대 수 (도착정보 호출 수 제한) */
export const REVERSE_STOPS_PER_STOP = 4;
/**
 * 반대 방향 도착(내릴) 정류장을 찾는 반경(m). 돌아오는 노선은 다른 길로 다니기도 해서 넓게 잡는다.
 * 내릴 정류장은 도착정보를 조회하지 않으므로 늘려도 API 호출은 늘지 않는다.
 */
export const REVERSE_DEST_RADIUS_M = 350;
export const REVERSE_DEST_PER_STOP = 20;
/** GPS로 방향을 정할 때, 한쪽이 이만큼(m) 이상 더 가까워야 확정 */
export const DIRECTION_GPS_MARGIN_M = 300;

/** 두 좌표 사이 거리(m) */
export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const toMin = (hhmm: string): number | null => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** 요일·시간대가 now 에 해당하는지. 자정을 넘는 시간대(22:00~01:00)는 시작 요일 기준. */
export function scheduleMatches(s: Schedule | null | undefined, now: Date): boolean {
  if (!s) return false;
  const start = toMin(s.start);
  const end = toMin(s.end);
  if (start === null || end === null) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (start <= end) return s.days.includes(now.getDay()) && cur >= start && cur < end;
  if (cur >= start) return s.days.includes(now.getDay());
  if (cur < end) return s.days.includes((now.getDay() + 6) % 7);
  return false;
}

/**
 * 정류장들 근처의 정류장 ID (자기 자신 포함, 가까운 순).
 * 반대 방향 정류장(길 건너편)은 ID가 다르므로 이 목록에 들어온다.
 * 방향이 맞는지는 recommend 가 노선 정류장 순서로 걸러 낸다.
 */
export function stopsNear(
  stopIds: StopId[],
  stops: Stop[],
  radiusM = REVERSE_STOP_RADIUS_M,
  perStop = REVERSE_STOPS_PER_STOP,
): StopId[] {
  const byId = new Map(stops.map((s) => [s.id, s]));
  const out: StopId[] = [];
  for (const id of stopIds) {
    const base = byId.get(id);
    if (!base) {
      if (!out.includes(id)) out.push(id);
      continue;
    }
    const near = stops
      .map((s) => ({ id: s.id, d: s.id === id ? 0 : distanceM(base, s) }))
      .filter((x) => x.d <= radiusM)
      .sort((a, b) => a.d - b.d)
      .slice(0, perStop);
    for (const n of near) if (!out.includes(n.id)) out.push(n.id);
  }
  return out;
}

/** 출발·도착을 뒤집은 구간. 정류장은 원래 정류장 근처(길 건너편 포함)로 넓힌다. */
export function reverseSegment(segment: CommuteSegment, stops: Stop[]): CommuteSegment {
  const fromStopIds = stopsNear(segment.toStopIds, stops);
  const walk = segment.reverse?.walkMin ?? 0;
  return {
    ...segment,
    id: `${segment.id}:reverse`,
    name: `${segment.name} (반대)`,
    fromStopIds,
    toStopIds: stopsNear(segment.fromStopIds, stops, REVERSE_DEST_RADIUS_M, REVERSE_DEST_PER_STOP),
    schedule: segment.reverse?.schedule ?? null,
    walkMin: Object.fromEntries(fromStopIds.map((id) => [id, walk])),
  };
}

export type DirectionReason = 'manual' | 'gps' | 'schedule' | 'time' | 'off';

export interface DirectionResult {
  direction: Direction;
  /** 실제 추천에 쓸 구간 (reverse면 뒤집힌 구간) */
  segment: CommuteSegment;
  reason: DirectionReason;
  /** 화면 표시용, 예: "현재 위치가 도착지 근처라 반대 방향" */
  explain: string;
}

function nearestM(pos: LatLng, ids: StopId[], byId: Map<StopId, Stop>): number | null {
  let best: number | null = null;
  for (const id of ids) {
    const s = byId.get(id);
    if (!s) continue;
    const d = distanceM(pos, s);
    if (best === null || d < best) best = d;
  }
  return best;
}

/**
 * 출발·도착 방향 자동 결정. 우선순위:
 * 1. 사용자가 직접 고른 방향 (manual)
 * 2. GPS: 현재 위치가 도착지 쪽에 DIRECTION_GPS_MARGIN_M 이상 더 가까우면 반대 방향
 * 3. 시간대: 반대 방향 시간대에 해당하면 반대, 원래 시간대면 정방향
 * 4. 그 외: 정오 이후면 반대 방향 (출근 구간 → 오후엔 퇴근으로 가정)
 */
export function resolveDirection(
  segment: CommuteSegment,
  opts: { now: Date; stops: Stop[]; position?: LatLng | null; manual?: Direction | null },
): DirectionResult {
  const make = (direction: Direction, reason: DirectionReason, explain: string): DirectionResult => ({
    direction,
    segment: direction === 'reverse' ? reverseSegment(segment, opts.stops) : segment,
    reason,
    explain,
  });

  if (!segment.reverse?.enabled) return make('forward', 'off', '');
  if (opts.manual) return make(opts.manual, 'manual', '직접 선택한 방향');

  if (opts.position) {
    const byId = new Map(opts.stops.map((s) => [s.id, s]));
    const dFrom = nearestM(opts.position, segment.fromStopIds, byId);
    const dTo = nearestM(opts.position, segment.toStopIds, byId);
    if (dFrom !== null && dTo !== null) {
      if (dTo + DIRECTION_GPS_MARGIN_M <= dFrom) return make('reverse', 'gps', '현재 위치가 도착지 근처라 반대 방향');
      if (dFrom + DIRECTION_GPS_MARGIN_M <= dTo) return make('forward', 'gps', '현재 위치가 출발지 근처라 정방향');
    }
  }

  if (scheduleMatches(segment.reverse.schedule, opts.now)) return make('reverse', 'schedule', '반대 방향 시간대');
  if (scheduleMatches(segment.schedule, opts.now)) return make('forward', 'schedule', '정방향 시간대');

  return opts.now.getHours() >= 12
    ? make('reverse', 'time', '오후라 반대 방향')
    : make('forward', 'time', '오전이라 정방향');
}

/** 구간이 지금 자동 선택 대상인지 (정방향 또는 반대 방향 시간대) */
export function segmentActive(segment: CommuteSegment, now: Date): boolean {
  return (
    scheduleMatches(segment.schedule, now) ||
    (!!segment.reverse?.enabled && scheduleMatches(segment.reverse.schedule, now))
  );
}
