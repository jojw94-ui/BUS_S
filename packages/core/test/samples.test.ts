// data/samples 의 실제 API 응답으로 추천을 돌려 본다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { recommend } from '../src/recommend';
import type { Route } from '../src/types';
import { parseItems, parseRouteStops, parseStopArrivals } from './helpers/bims-xml';
import { BUJEON_MARKET, SEOMYEON_LOTTE, WEEKDAY_PEAK, segment } from './helpers/fixtures';

const sample = (name: string) =>
  readFileSync(new URL(`../../../data/samples/${name}`, import.meta.url), 'utf8');

function route83(): Route {
  const info = parseItems(sample('busInfo_83.xml')).find((i) => i.buslinenum === '83')!;
  return {
    id: info.lineid,
    no: info.buslinenum,
    type: info.bustype,
    stops: parseRouteStops(sample('busInfoByRouteId_83.xml')),
    headway: {
      peak: Number(info.headwaypeak),
      normal: Number(info.headwaynorm),
      holiday: Number(info.headwayholi),
    },
    firstTime: info.firsttime,
    lastTime: info.endtime,
  };
}

describe('실제 샘플 응답', () => {
  const route = route83();
  const routes = { [route.id]: route };

  it('83번 노선 정보 파싱', () => {
    expect(route.id).toBe('5200083000');
    expect(route.headway).toEqual({ peak: 5, normal: 8, holiday: 11 });
    expect(route.stops.find((s) => s.stopId === SEOMYEON_LOTTE)?.seq).toBe(24);
    expect(route.stops.find((s) => s.stopId === BUJEON_MARKET)?.seq).toBe(26);
  });

  it('서면역.롯데호텔백화점 → 부전시장: 83번 추천', () => {
    const arrivals = parseStopArrivals(sample('stopArrByBstopid_164630302.xml'));
    const r = recommend({ segment: segment(), arrivals, routes, profile: null, now: WEEKDAY_PEAK });
    expect(r.best).toMatchObject({
      routeNo: '83',
      busIndex: 0,
      rideStops: 2,
      bus: { carNo: '4135', etaMin: 5, stopsAway: 3, lowFloor: true },
    });
    // 1번째 5분/배차 5분 = 1.0 → 보통, 2번째 (11-5)/5 = 1.2 → 보통 → 다음 차 추천 없음
    expect(r.best?.congestion.level).toBe(1);
    expect(r.waitForNext).toBeNull();
    expect(r.reason).toBe('83번 추정 보통 · 5분 후 도착 · 4분 소요');
  });

  it('서면 일대 전체 도착정보에서도 정적 노선이 있는 후보만 고른다', () => {
    const arrivals = parseStopArrivals(sample('stopArr_seomyeon_all.xml'));
    expect(arrivals.length).toBeGreaterThan(100);
    const r = recommend({ segment: segment(), arrivals, routes, profile: null, now: WEEKDAY_PEAK });
    expect(r.candidates.map((c) => c.routeNo)).toEqual(['83']);
    expect(r.best?.bus.carNo).toBe('4135');
  });
});
