// 출발·도착 자동 전환. 정적 데이터(data/static)의 실제 정류장·노선으로도 확인한다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveDirection, reverseSegment, scheduleMatches, segmentActive, stopsNear } from '../src/direction';
import { recommend } from '../src/recommend';
import type { Arrival, CommuteSegment, Route, Stop } from '../src/types';

const staticJson = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../../../data/static/${name}`, import.meta.url), 'utf8')) as T;
const STOPS = staticJson<Stop[]>('stops.json');
const ROUTES = staticJson<Route[]>('routes.json');

// 서면역.서면지하상가(서면한전 방면) → 부산역
const SEOMYEON = '505850000';
const SEOMYEON_OPPOSITE = '505860000'; // 같은 이름, 길 건너편
const BUSAN_STN = '509960000';

const seg = (over: Partial<CommuteSegment> = {}): CommuteSegment => ({
  id: 'commute',
  name: '출근',
  fromStopIds: [SEOMYEON],
  toStopIds: [BUSAN_STN],
  routeFilter: [],
  schedule: { days: [1, 2, 3, 4, 5], start: '07:00', end: '09:00' },
  maxWaitMin: 15,
  walkMin: { [SEOMYEON]: 3 },
  reverse: { enabled: true, schedule: { days: [1, 2, 3, 4, 5], start: '18:00', end: '20:00' }, walkMin: 2 },
  ...over,
});

// 2026-10-21 수요일
const at = (hm: string) => new Date(`2026-10-21T${hm}:00+09:00`);
const stopPos = (id: string) => {
  const s = STOPS.find((x) => x.id === id)!;
  return { lat: s.lat, lng: s.lng };
};

describe('scheduleMatches', () => {
  it('시간대 안/밖, 자정 넘는 시간대', () => {
    const s = { days: [3], start: '07:00', end: '09:00' };
    expect(scheduleMatches(s, at('08:00'))).toBe(true);
    expect(scheduleMatches(s, at('09:00'))).toBe(false);
    const night = { days: [3], start: '23:00', end: '01:00' };
    expect(scheduleMatches(night, at('23:30'))).toBe(true);
    expect(scheduleMatches(night, new Date('2026-10-22T00:30:00+09:00'))).toBe(true); // 목 0:30 → 수요일 시작분
    expect(scheduleMatches(null, at('08:00'))).toBe(false);
  });
});

describe('stopsNear / reverseSegment', () => {
  it('길 건너편 같은 이름 정류장을 포함한다', () => {
    const near = stopsNear([SEOMYEON], STOPS);
    expect(near[0]).toBe(SEOMYEON);
    expect(near).toContain(SEOMYEON_OPPOSITE);
    expect(near.length).toBeLessThanOrEqual(4);
  });
  it('출발·도착이 뒤집히고 반대 방향 시간대·도보시간을 쓴다', () => {
    const r = reverseSegment(seg(), STOPS);
    expect(r.id).toBe('commute:reverse');
    expect(r.fromStopIds).toContain(BUSAN_STN);
    expect(r.toStopIds).toContain(SEOMYEON_OPPOSITE);
    expect(r.schedule?.start).toBe('18:00');
    expect(Object.values(r.walkMin).every((m) => m === 2)).toBe(true);
  });
});

describe('resolveDirection', () => {
  const opts = (hm: string, extra = {}) => ({ now: at(hm), stops: STOPS, ...extra });

  it('자동 전환을 끄면 항상 정방향', () => {
    const r = resolveDirection(seg({ reverse: undefined }), opts('19:00'));
    expect([r.direction, r.reason]).toEqual(['forward', 'off']);
  });
  it('직접 고른 방향이 최우선', () => {
    const r = resolveDirection(seg(), opts('08:00', { manual: 'reverse', position: stopPos(SEOMYEON) }));
    expect([r.direction, r.reason]).toEqual(['reverse', 'manual']);
  });
  it('GPS: 도착지(부산역) 근처면 반대 방향, 출발지 근처면 정방향 — 시간대보다 우선', () => {
    expect(resolveDirection(seg(), opts('08:00', { position: stopPos(BUSAN_STN) })).direction).toBe('reverse');
    expect(resolveDirection(seg(), opts('19:00', { position: stopPos(SEOMYEON) })).direction).toBe('forward');
  });
  it('GPS가 애매하면(양쪽 거리 차이 작음) 시간대로 판단', () => {
    const mid = { lat: (stopPos(SEOMYEON).lat + stopPos(BUSAN_STN).lat) / 2, lng: (stopPos(SEOMYEON).lng + stopPos(BUSAN_STN).lng) / 2 };
    expect(resolveDirection(seg(), opts('19:00', { position: mid })).reason).toBe('schedule');
  });
  it('시간대: 출근 시간 정방향, 퇴근 시간 반대 방향', () => {
    expect(resolveDirection(seg(), opts('08:00')).direction).toBe('forward');
    expect(resolveDirection(seg(), opts('19:00')).direction).toBe('reverse');
  });
  it('시간대 밖이면 오전 정방향, 오후 반대 방향', () => {
    expect(resolveDirection(seg(), opts('10:30'))).toMatchObject({ direction: 'forward', reason: 'time' });
    expect(resolveDirection(seg(), opts('14:00'))).toMatchObject({ direction: 'reverse', reason: 'time' });
  });
});

describe('segmentActive', () => {
  it('정방향 또는 반대 방향 시간대면 자동 선택 대상', () => {
    expect(segmentActive(seg(), at('08:00'))).toBe(true);
    expect(segmentActive(seg(), at('19:00'))).toBe(true);
    expect(segmentActive(seg(), at('14:00'))).toBe(false);
    expect(segmentActive(seg({ reverse: { enabled: false, schedule: null } }), at('19:00'))).toBe(false);
  });
});

describe('반대 방향 구간으로 실제 노선 추천', () => {
  it('부산역 → 서면: 정방향과 같은 노선들이 반대 방향 정류장으로 후보가 된다', () => {
    const rev = reverseSegment(seg(), STOPS);
    const routes = Object.fromEntries(ROUTES.map((r) => [r.id, r]));
    // 반대 방향 출발 정류장에 오는 노선마다 3분 뒤 버스가 있다고 가정
    const arrivals: Arrival[] = [];
    for (const r of ROUTES) {
      for (const s of r.stops) {
        if (!rev.fromStopIds.includes(s.stopId)) continue;
        arrivals.push({
          stopId: s.stopId, routeId: r.id, routeNo: r.no, stopSeq: s.seq, fetchedAt: '',
          buses: [{ carNo: 'x', etaMin: 3, stopsAway: 2, lowFloor: false }],
        });
      }
    }
    const rec = recommend({ segment: rev, arrivals, routes, profile: null, now: at('19:00') });
    const nos = new Set(rec.candidates.map((c) => c.routeNo));
    expect(rec.best).not.toBeNull();
    for (const no of ['81', '17', '167', '43']) expect(nos.has(no)).toBe(true);
    // 43번은 돌아올 때 서면역 대신 304m 떨어진 서면한전을 지난다 → 내릴 정류장 반경(350m)에 포함
    // 모든 후보는 서면 쪽에서 내린다
    for (const c of rec.candidates) expect(rev.toStopIds).toContain(c.toStopId);
  });
});
