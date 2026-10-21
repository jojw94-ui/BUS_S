// BUS_S 공용 데이터 계약.
// core(추천 로직)·scripts(데이터 가공)·app(앱)이 모두 이 타입을 기준으로 작업한다.
// 변경이 필요하면 임의로 고치지 말고 docs/decisions/에 제안을 남긴다.

/** BIMS 정류소ID (bstopid, 9자리 문자열) */
export type StopId = string;
/** BIMS 노선ID (lineid, 10자리 문자열) */
export type RouteId = string;

export type BusType = '일반버스' | '급행버스' | '마을버스' | '심야버스(급행)' | '심야버스(일반)' | string;

/** data/static/stops.json 의 원소 */
export interface Stop {
  id: StopId;
  /** ARS번호 (5자리). 원본에 없는 정류장(전체의 약 절반)은 빈 문자열 */
  arsNo: string;
  name: string;
  lat: number;
  lng: number;
  /** 다음 정류장 이름 — "OO 방면" 표시용, 모르면 생략 */
  towards?: string;
}

/** 노선이 지나는 정류장 1개 (busInfoByRouteId 의 정류장 행) */
export interface RouteStop {
  stopId: StopId;
  /** 노선 내 순번 (bstopidx), 1부터 */
  seq: number;
  name: string;
}

/** data/static/routes.json 의 원소 */
export interface Route {
  id: RouteId;
  /** 노선 번호 (lineno), 예: "83", "1001" */
  no: string;
  type: BusType;
  /** 기점 → 종점 → (회차 후) 순서. 왕복 노선은 같은 정류장명이 두 번 나올 수 있으나 stopId는 다르다 */
  stops: RouteStop[];
  /** 배차 간격(분). 원본에 값이 없으면 0 — 0은 "모름"으로 취급한다 */
  headway: { peak: number; normal: number; holiday: number };
  firstTime: string; // "05:00"
  lastTime: string; // "22:20"
}

/** 정류장에 도착 예정인 버스 1대 */
export interface ArrivalBus {
  carNo: string;
  /** 도착 예정(분) */
  etaMin: number;
  /** 남은 정류장 수 */
  stopsAway: number;
  lowFloor: boolean;
}

/** 정류장 1곳·노선 1개의 실시간 도착정보 (stopArrByBstopid 1행) */
export interface Arrival {
  stopId: StopId;
  routeId: RouteId;
  routeNo: string;
  /** 이 노선에서 해당 정류장의 순번 (bstopidx) */
  stopSeq: number;
  /** 0~2대, etaMin 오름차순 */
  buses: ArrivalBus[];
  /** 조회 시각 (ISO 문자열) */
  fetchedAt: string;
}

/**
 * 평소 혼잡도 표 (data/static/congestion-profile.json)
 * 2023-07-31 승하차 통계에서 하차 보정 후 계산한 "정류장 출발 시점 재차인원 추정치".
 */
export interface CongestionProfile {
  source: string;
  /** 시간대 길이(분) — 30 */
  slotMinutes: number;
  /** slot 0의 시작 시각 — "04:00" */
  firstSlot: string;
  /**
   * routeNo → stopSeq(문자열) → slot별 값 배열 (길이 48).
   * 값은 버스 1대가 아니라 "그 시간대 동안 정류장을 지난 모든 버스의 승객 흐름 합"이다.
   * core는 slotMinutes / 배차간격으로 나눠 버스 1대 기준으로 환산해 쓴다 (perBusLoad).
   */
  routes: Record<string, Record<string, number[]>>;
}

/** 0 여유, 1 보통, 2 혼잡, 3 매우혼잡 */
export type CongestionLevel = 0 | 1 | 2 | 3;

export interface CongestionEstimate {
  level: CongestionLevel;
  /** 버스 1대 기준 평소 재차인원 추정치 (프로필·배차간격 없으면 null) */
  baseline: number | null;
  /** 실제 간격 / 평소 배차 간격 (계산 불가면 null) */
  gapRatio: number | null;
  /** 항상 true — 실측이 아님을 UI에 표시 */
  estimated: true;
}

/** 요일·시간대. days: 0=일 ~ 6=토, start/end: "HH:MM" (자정을 넘을 수 있음) */
export interface Schedule {
  days: number[];
  start: string;
  end: string;
}

/** 출퇴근 구간 설정 (앱 기기 내 저장) */
export interface CommuteSegment {
  id: string;
  name: string; // "출근"
  fromStopIds: StopId[];
  toStopIds: StopId[];
  /** 비어 있으면 자동(후보 전부) */
  routeFilter: string[];
  schedule: Schedule | null;
  maxWaitMin: number;
  /** 출발 정류장별 도보시간(분) */
  walkMin: Record<StopId, number>;
  /**
   * 반대 방향 자동 전환 (예: 출근 구간 하나로 퇴근도 추천). 없으면 끔.
   * 반대 방향의 정류장은 원래 도착/출발 정류장 근처(길 건너편 포함)에서 자동으로 찾는다.
   */
  reverse?: {
    enabled: boolean;
    /** 반대 방향을 자동 선택할 시간대 (예: 평일 18:00~20:00) */
    schedule: Schedule | null;
    /** 반대 방향 출발 정류장(= 원래 도착지 근처)까지 도보시간(분) */
    walkMin?: number;
  };
}

export type Direction = 'forward' | 'reverse';

export interface LatLng {
  lat: number;
  lng: number;
}

/** 추천 기준값 — 기본값은 core에서 제공, 앱 설정으로 덮어씀 */
export interface RecommendConfig {
  /** 다음 차를 기다려도 되는 추가 대기 허용(분) */
  nextBusExtraWaitMin: number;
  /** 정류장 1개 이동 시간(분) — 소요시간 추정용 */
  minPerStop: number;
  /** gapRatio → level 경계 [보통, 혼잡, 매우혼잡] */
  gapRatioThresholds: [number, number, number];
  /** baseline 재차인원 → level 경계 [보통, 혼잡, 매우혼잡] */
  baselineThresholds: [number, number, number];
}

export interface Candidate {
  routeId: RouteId;
  routeNo: string;
  fromStopId: StopId;
  toStopId: StopId;
  bus: ArrivalBus;
  /** 0 = 첫 번째 버스, 1 = 두 번째 버스 */
  busIndex: 0 | 1;
  rideStops: number;
  rideMin: number;
  /** 대기 + 탑승 */
  totalMin: number;
  congestion: CongestionEstimate;
}

export interface Recommendation {
  best: Candidate | null;
  /** 같은 노선 다음 차가 낫다면 그 차 */
  waitForNext: Candidate | null;
  /** 사람이 읽을 추천 이유, 예: "83번 추정 여유 · 5분 후 도착 · 12분 소요" */
  reason: string;
  /** best 포함 전체 후보, 추천 순 */
  candidates: Candidate[];
}

export interface RecommendInput {
  segment: CommuteSegment;
  arrivals: Arrival[];
  routes: Record<RouteId, Route>;
  profile: CongestionProfile | null;
  now: Date;
  config?: Partial<RecommendConfig>;
}

// 구현: packages/core/src/recommend.ts
// export function recommend(input: RecommendInput): Recommendation
