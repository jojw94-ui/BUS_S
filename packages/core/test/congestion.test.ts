import { describe, expect, it } from 'vitest';
import { DEFAULT_RECOMMEND_CONFIG as CFG } from '../src/config';
import {
  baselineLoad,
  combineLevel,
  estimateCongestion,
  gapRatio,
  headwayFor,
  headwayKind,
  profileSlot,
} from '../src/congestion';
import type { ArrivalBus, CongestionProfile } from '../src/types';
import { ROUTE_83, SATURDAY, WEEKDAY_NORMAL, WEEKDAY_PEAK } from './helpers/fixtures';

const bus = (etaMin: number): ArrivalBus => ({ carNo: `${etaMin}`, etaMin, stopsAway: 1, lowFloor: true });

describe('배차 간격 종류', () => {
  it('평일 07~09시·17~19시는 peak, 그 외 평일은 normal', () => {
    expect(headwayKind(WEEKDAY_PEAK)).toBe('peak');
    expect(headwayKind(new Date(2026, 9, 21, 7, 0))).toBe('peak');
    expect(headwayKind(new Date(2026, 9, 21, 8, 59))).toBe('peak');
    expect(headwayKind(new Date(2026, 9, 21, 9, 0))).toBe('normal');
    expect(headwayKind(new Date(2026, 9, 21, 17, 30))).toBe('peak');
    expect(headwayKind(new Date(2026, 9, 21, 19, 0))).toBe('normal');
    expect(headwayKind(WEEKDAY_NORMAL)).toBe('normal');
  });

  it('토·일은 holiday', () => {
    expect(headwayKind(SATURDAY)).toBe('holiday');
    expect(headwayKind(new Date(2026, 9, 25, 18, 0))).toBe('holiday');
    expect(headwayFor(ROUTE_83, SATURDAY)).toBe(11);
    expect(headwayFor(ROUTE_83, WEEKDAY_PEAK)).toBe(5);
    expect(headwayFor(ROUTE_83, WEEKDAY_NORMAL)).toBe(8);
  });

  it('배차 간격이 0이면 계산 불가', () => {
    expect(headwayFor({ ...ROUTE_83, headway: { peak: 0, normal: 0, holiday: 0 } }, WEEKDAY_PEAK)).toBeNull();
  });
});

describe('평소 재차인원 (프로필)', () => {
  const profile: CongestionProfile = {
    source: 'test',
    slotMinutes: 30,
    firstSlot: '04:00',
    routes: { '83': { '24': Array.from({ length: 48 }, (_, i) => i * 10) } },
  };

  it('현재 시각의 30분 시간대를 찾는다', () => {
    expect(profileSlot(profile, new Date(2026, 9, 21, 4, 0))).toBe(0);
    expect(profileSlot(profile, new Date(2026, 9, 21, 8, 29))).toBe(8);
    expect(profileSlot(profile, new Date(2026, 9, 21, 3, 59))).toBe(47);
  });

  it('노선·정류장 순번·시간대로 값을 꺼낸다', () => {
    expect(baselineLoad(profile, '83', 24, WEEKDAY_PEAK)).toBe(80);
    expect(baselineLoad(profile, '83', 25, WEEKDAY_PEAK)).toBeNull();
    expect(baselineLoad(profile, '10', 24, WEEKDAY_PEAK)).toBeNull();
    expect(baselineLoad(null, '83', 24, WEEKDAY_PEAK)).toBeNull();
  });
});

describe('간격비', () => {
  it('2번째 버스는 1·2번째 도착 간격 / 배차 간격', () => {
    expect(gapRatio([bus(3), bus(5)], 1, 5)).toBeCloseTo(0.4);
    expect(gapRatio([bus(3), bus(3)], 1, 5)).toBe(0);
  });

  it('1번째 버스는 etaMin 이 배차 간격 이상일 때만 etaMin 기준', () => {
    expect(gapRatio([bus(9)], 0, 5)).toBeCloseTo(1.8);
    expect(gapRatio([bus(3)], 0, 5)).toBeNull();
  });

  it('배차 간격이나 버스가 없으면 null', () => {
    expect(gapRatio([bus(9)], 0, null)).toBeNull();
    expect(gapRatio([bus(9)], 1, 5)).toBeNull();
  });
});

describe('혼잡 단계 결합', () => {
  it('둘 다 있으면 평소 단계를 간격비로 보정', () => {
    expect(combineLevel(50, 1.0, CFG)).toBe(2); // 혼잡 + 보통 간격
    expect(combineLevel(50, 0.4, CFG)).toBe(1); // 혼잡이지만 앞차에 붙어 옴
    expect(combineLevel(50, 1.5, CFG)).toBe(3); // 혼잡 + 간격 벌어짐
    expect(combineLevel(70, 2.0, CFG)).toBe(3); // 상한
    expect(combineLevel(10, 0.2, CFG)).toBe(0); // 하한
  });

  it('하나만 있어도 동작', () => {
    expect(combineLevel(30, null, CFG)).toBe(1);
    expect(combineLevel(70, null, CFG)).toBe(3);
    expect(combineLevel(null, 0.5, CFG)).toBe(0);
    expect(combineLevel(null, 1.9, CFG)).toBe(3);
  });

  it('둘 다 없으면 보통(1)', () => {
    expect(combineLevel(null, null, CFG)).toBe(1);
  });

  it('estimateCongestion 은 근거값과 estimated: true 를 함께 돌려준다', () => {
    const est = estimateCongestion({
      route: ROUTE_83,
      stopSeq: 24,
      buses: [bus(9), bus(10)],
      busIndex: 0,
      profile: null,
      now: WEEKDAY_PEAK,
      config: CFG,
    });
    expect(est).toEqual({ level: 3, baseline: null, gapRatio: 1.8, estimated: true });
  });
});
