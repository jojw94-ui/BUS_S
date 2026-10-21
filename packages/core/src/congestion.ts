import type {
  ArrivalBus,
  CongestionEstimate,
  CongestionLevel,
  CongestionProfile,
  RecommendConfig,
  Route,
} from './types';

export const CONGESTION_LABELS: Record<CongestionLevel, string> = {
  0: '여유',
  1: '보통',
  2: '혼잡',
  3: '매우혼잡',
};

/** 둘 다 없을 때의 기본 단계 (보통) */
const UNKNOWN_LEVEL: CongestionLevel = 1;

/** 평일 첨두 시간대 [시작시, 끝시) — 07~09시, 17~19시 */
const PEAK_HOURS: Array<[number, number]> = [
  [7, 9],
  [17, 19],
];

export type HeadwayKind = 'peak' | 'normal' | 'holiday';

/**
 * 현재 시각에 맞는 배차 간격 종류.
 * 토·일은 holiday, 평일 첨두 시간대는 peak, 나머지는 normal.
 * 공휴일 달력은 아직 없으므로 평일 공휴일은 평일로 취급한다.
 */
export function headwayKind(now: Date): HeadwayKind {
  const day = now.getDay();
  if (day === 0 || day === 6) return 'holiday';
  const hour = now.getHours();
  return PEAK_HOURS.some(([start, end]) => hour >= start && hour < end) ? 'peak' : 'normal';
}

export function headwayFor(route: Route, now: Date): number | null {
  const minutes = route.headway[headwayKind(now)];
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

function parseHm(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** now 가 속한 프로필 시간대 번호. 범위를 벗어나면 null */
export function profileSlot(profile: CongestionProfile, now: Date): number | null {
  const first = parseHm(profile.firstSlot);
  if (first === null || !(profile.slotMinutes > 0)) return null;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const sinceFirst = (((minutes - first) % 1440) + 1440) % 1440;
  return Math.floor(sinceFirst / profile.slotMinutes);
}

/** 평소 재차인원 추정치 (routeNo·stopSeq·현재 시간대). 없으면 null */
export function baselineLoad(
  profile: CongestionProfile | null,
  routeNo: string,
  stopSeq: number,
  now: Date,
): number | null {
  if (!profile) return null;
  const slots = profile.routes[routeNo]?.[String(stopSeq)];
  if (!slots) return null;
  const slot = profileSlot(profile, now);
  if (slot === null) return null;
  const value = slots[slot];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * 실제 간격 / 평소 배차 간격.
 * - 2번째 버스: 1번째 버스와의 도착 간격 (min2 - min1)
 * - 1번째 버스: 앞차는 이미 지나갔으므로 실제 간격은 etaMin 이상이라는 것만 안다.
 *   etaMin 이 배차 간격 이상일 때만(= 간격이 벌어진 것이 확실할 때만) etaMin 을 간격으로 쓰고,
 *   그보다 짧으면 판단 불가(null)로 둔다.
 */
export function gapRatio(
  buses: ArrivalBus[],
  busIndex: 0 | 1,
  headway: number | null,
): number | null {
  if (headway === null) return null;
  const bus = buses[busIndex];
  if (!bus) return null;
  if (busIndex === 1) {
    const prev = buses[0];
    if (!prev) return null;
    return Math.max(0, bus.etaMin - prev.etaMin) / headway;
  }
  return bus.etaMin >= headway ? bus.etaMin / headway : null;
}

/** 값이 경계 [보통, 혼잡, 매우혼잡] 중 몇 개 이상인지 → 단계 */
export function levelByThresholds(
  value: number,
  thresholds: [number, number, number],
): CongestionLevel {
  let level = 0;
  for (const t of thresholds) if (value >= t) level++;
  return level as CongestionLevel;
}

function clampLevel(n: number): CongestionLevel {
  return Math.min(3, Math.max(0, n)) as CongestionLevel;
}

/**
 * 평소 재차인원 단계와 간격비 단계를 결합.
 * - 둘 다 있으면: 평소 단계 + (간격비 단계 - 1). 간격비가 "보통"이면 평소 단계 그대로,
 *   간격이 벌어졌으면 올리고, 앞차에 붙어 오면 내린다. 0~3으로 자른다.
 * - 하나만 있으면 그 단계, 둘 다 없으면 보통(1).
 */
export function combineLevel(
  baseline: number | null,
  ratio: number | null,
  config: RecommendConfig,
): CongestionLevel {
  const baseLevel = baseline === null ? null : levelByThresholds(baseline, config.baselineThresholds);
  const gapLevel = ratio === null ? null : levelByThresholds(ratio, config.gapRatioThresholds);
  if (baseLevel !== null && gapLevel !== null) return clampLevel(baseLevel + gapLevel - 1);
  return baseLevel ?? gapLevel ?? UNKNOWN_LEVEL;
}

export interface CongestionParams {
  route: Route;
  /** 탑승 정류장의 노선 내 순번 */
  stopSeq: number;
  /** 해당 정류장에 오는 이 노선의 버스들 (etaMin 오름차순) */
  buses: ArrivalBus[];
  busIndex: 0 | 1;
  profile: CongestionProfile | null;
  now: Date;
  config: RecommendConfig;
}

/**
 * 프로필 값(시간대 동안 그 정류장을 지난 모든 버스의 승객 흐름 합)을 버스 1대 기준으로 환산.
 * 시간대 동안 다니는 버스 수 ≈ slotMinutes / headway. 배차 간격을 모르면 null.
 */
export function perBusLoad(
  slotTotal: number | null,
  headway: number | null,
  slotMinutes: number,
): number | null {
  if (slotTotal === null || headway === null || !(slotMinutes > 0)) return null;
  return Math.round(((slotTotal * Math.min(headway, slotMinutes)) / slotMinutes) * 10) / 10;
}

export function estimateCongestion(p: CongestionParams): CongestionEstimate {
  const headway = headwayFor(p.route, p.now);
  const baseline = perBusLoad(
    baselineLoad(p.profile, p.route.no, p.stopSeq, p.now),
    headway,
    p.profile?.slotMinutes ?? 0,
  );
  const ratio = gapRatio(p.buses, p.busIndex, headway);
  return {
    level: combineLevel(baseline, ratio, p.config),
    baseline,
    gapRatio: ratio,
    estimated: true,
  };
}
