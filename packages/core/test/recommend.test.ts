import { describe, expect, it } from 'vitest';
import { recommend } from '../src/recommend';
import type { RecommendInput, Route } from '../src/types';
import { parseStopArrivals, stopArrXml } from './helpers/bims-xml';
import {
  BUJEON_MARKET,
  HANJEON_BACK,
  HANJEON_OUT,
  LOTTE_SEOMYEON,
  ROUTE_10,
  ROUTE_20,
  ROUTE_83,
  ROUTES,
  SEOMYEON_LOTTE,
  WEEKDAY_PEAK,
  arrItem,
  flatProfile,
  segment,
} from './helpers/fixtures';

function input(items: string, overrides: Partial<RecommendInput> = {}): RecommendInput {
  return {
    segment: segment(),
    arrivals: parseStopArrivals(stopArrXml(items)),
    routes: ROUTES,
    profile: null,
    now: WEEKDAY_PEAK,
    ...overrides,
  };
}

describe('recommend — 정렬', () => {
  it('혼잡 단계가 같고 총 소요시간이 같으면 먼저 오는 버스', () => {
    const r = recommend(
      input(
        arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190', { carNo: '4135', min: 4 }) + // 4 + 2정거장×2 = 8
          arrItem(ROUTE_10, SEOMYEON_LOTTE, '05190', { carNo: '1001', min: 2 }), // 2 + 3정거장×2 = 8
      ),
    );
    expect(r.candidates.map((c) => [c.routeNo, c.totalMin, c.congestion.level])).toEqual([
      ['10', 8, 1],
      ['83', 8, 1],
    ]);
    expect(r.best?.routeNo).toBe('10');
    expect(r.waitForNext).toBeNull();
    expect(r.reason).toBe('10번 추정 보통 · 2분 후 도착 · 6분 소요');
  });

  it('완전 동률이면 노선 번호 순 (결과가 매번 같아야 함)', () => {
    const items =
      arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190', { carNo: '4135', min: 4 }) +
      arrItem(ROUTE_20, LOTTE_SEOMYEON, '05237', { carNo: '2001', min: 4 });
    const seg = segment({ fromStopIds: [SEOMYEON_LOTTE, LOTTE_SEOMYEON] });
    const r = recommend(input(items, { segment: seg }));
    expect(r.candidates.map((c) => c.routeNo)).toEqual(['20', '83']);
    expect(r.best?.fromStopId).toBe(LOTTE_SEOMYEON);

    const reversed = recommend({ ...input(items, { segment: seg }), arrivals: input(items).arrivals.reverse() });
    expect(reversed.candidates.map((c) => c.routeNo)).toEqual(['20', '83']);
  });

  it('혼잡 단계가 총 소요시간보다 우선', () => {
    // 83번 1번째 차: 9분 후 / 배차 5분 → 간격비 1.8 → 매우혼잡
    const r = recommend(
      input(
        arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190', { carNo: '4135', min: 9 }) +
          arrItem(ROUTE_10, SEOMYEON_LOTTE, '05190', { carNo: '1001', min: 9 }),
        { segment: segment({ maxWaitMin: 15 }) },
      ),
    );
    expect(r.candidates.map((c) => [c.routeNo, c.congestion.level])).toEqual([
      ['10', 1],
      ['83', 3],
    ]);
  });

  it('routeFilter 로 이용 노선 제한 (번호 또는 노선ID)', () => {
    const items =
      arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190', { carNo: '4135', min: 4 }) +
      arrItem(ROUTE_10, SEOMYEON_LOTTE, '05190', { carNo: '1001', min: 2 });
    expect(recommend(input(items, { segment: segment({ routeFilter: ['83'] }) })).best?.routeNo).toBe('83');
    expect(
      recommend(input(items, { segment: segment({ routeFilter: [ROUTE_83.id] }) })).candidates,
    ).toHaveLength(1);
  });
});

describe('recommend — 후보 없음', () => {
  it('모든 버스가 최대 대기시간을 넘음', () => {
    const r = recommend(
      input(arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190', { carNo: '4135', min: 12 }, { carNo: '4152', min: 18 })),
    );
    expect(r.best).toBeNull();
    expect(r.waitForNext).toBeNull();
    expect(r.candidates).toEqual([]);
    expect(r.reason).toBe('최대 대기 10분 안에 걸어가서 탈 수 있는 버스가 없습니다.');
  });

  it('도착 예정 버스가 없음 (carno 없는 행)', () => {
    const r = recommend(input(arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190')));
    expect(r.best).toBeNull();
    expect(r.reason).toBe('지금 도착 예정인 버스가 없습니다.');
  });

  it('도착정보가 비어 있음', () => {
    const r = recommend(input(''));
    expect(r.best).toBeNull();
    expect(r.reason).toBe('지금 도착 예정인 버스가 없습니다.');
  });

  it('이용 노선 설정에 맞는 노선이 없음', () => {
    const r = recommend(
      input(arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190', { carNo: '4135', min: 4 }), {
        segment: segment({ routeFilter: ['1001'] }),
      }),
    );
    expect(r.best).toBeNull();
    expect(r.reason).toContain('같은 방향으로 지나는 노선이 없습니다');
  });

  it('정적 노선 정보가 없는 노선의 도착정보는 무시', () => {
    const r = recommend(
      input(arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190', { carNo: '4135', min: 4 }), { routes: {} }),
    );
    expect(r.best).toBeNull();
  });
});

describe('recommend — 전부 혼잡', () => {
  it('가장 덜 혼잡한 버스를 추천하고 이유에 표시', () => {
    // 평소 재차인원: 83번 24번째 50명(혼잡), 10번 10번째 70명(매우혼잡)
    // 프로필은 30분 합계 → 대당 = 합계 × 배차 / 30 (83번 첨두 5분: 300→50, 10번 첨두 10분: 210→70)
    const profile = flatProfile({ '83': { '24': 300 }, '10': { '10': 210 } });
    const r = recommend(
      input(
        arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190', { carNo: '4135', min: 3 }) +
          arrItem(ROUTE_10, SEOMYEON_LOTTE, '05190', { carNo: '1001', min: 1 }),
        { profile },
      ),
    );
    expect(r.candidates.map((c) => [c.routeNo, c.congestion.level, c.congestion.baseline])).toEqual([
      ['83', 2, 50],
      ['10', 3, 70],
    ]);
    expect(r.best?.routeNo).toBe('83');
    expect(r.waitForNext).toBeNull();
    expect(r.reason).toBe('83번 추정 혼잡 · 3분 후 도착 · 4분 소요 · 모든 후보가 혼잡 예상');
  });

  it('같은 혼잡 단계면 총 소요시간 순', () => {
    const profile = flatProfile({ '83': { '24': 300 }, '10': { '10': 150 } });
    const r = recommend(
      input(
        arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190', { carNo: '4135', min: 3 }) + // 7분
          arrItem(ROUTE_10, SEOMYEON_LOTTE, '05190', { carNo: '1001', min: 2 }), // 8분
        { profile },
      ),
    );
    expect(r.candidates.map((c) => [c.routeNo, c.totalMin])).toEqual([
      ['83', 7],
      ['10', 8],
    ]);
  });
});

describe('recommend — 다음 차 추천', () => {
  // 83번 1번째 9분 후(간격비 1.8 → 매우혼잡), 2번째 10분 후(앞차와 1분 → 여유)
  const bunched = arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190', { carNo: '4135', min: 9 }, { carNo: '4152', min: 10 });

  it('같은 노선 2번째 버스가 덜 혼잡하고 추가 대기가 허용 범위 이내', () => {
    const r = recommend(input(bunched));
    expect(r.best?.bus.carNo).toBe('4135');
    expect(r.best?.congestion.level).toBe(3);
    expect(r.waitForNext?.bus.carNo).toBe('4152');
    expect(r.waitForNext?.busIndex).toBe(1);
    expect(r.waitForNext?.congestion.level).toBe(0);
    expect(r.waitForNext?.totalMin).toBe(14);
    expect(r.reason).toBe('83번 다음 차 추천 · 앞차 추정 매우혼잡, 1분 더 기다리면 추정 여유 · 10분 후 도착 · 4분 소요');
    // 후보 목록에는 노선별 첫 버스만
    expect(r.candidates).toHaveLength(1);
  });

  it('추가 대기가 허용 범위를 넘으면 다음 차 추천 안 함', () => {
    const items = arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190', { carNo: '4135', min: 9 }, { carNo: '4152', min: 15 });
    const seg = segment({ maxWaitMin: 20 });
    // 추가 대기 6분 > 기본 5분
    expect(recommend(input(items, { segment: seg })).waitForNext).toBeNull();
    // 설정으로 허용 범위를 6분으로 늘리면 추천
    const r = recommend(input(items, { segment: seg, config: { nextBusExtraWaitMin: 6 } }));
    expect(r.waitForNext?.bus.carNo).toBe('4152');
    expect(r.waitForNext?.congestion.level).toBe(1); // 6/5 = 1.2 → 보통
  });

  it('2번째 버스가 최대 대기시간을 넘으면 다음 차 추천 안 함', () => {
    const r = recommend(input(bunched, { segment: segment({ maxWaitMin: 9 }) }));
    expect(r.best?.bus.carNo).toBe('4135');
    expect(r.waitForNext).toBeNull();
  });

  it('2번째 버스가 더 낫지 않으면 다음 차 추천 안 함', () => {
    // 1번째 3분(간격비 판단 불가 → 보통), 2번째 8분(간격 5분/배차 5분 = 1.0 → 보통)
    const r = recommend(
      input(arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190', { carNo: '4135', min: 3 }, { carNo: '4152', min: 8 })),
    );
    expect(r.best?.congestion.level).toBe(1);
    expect(r.waitForNext).toBeNull();
  });
});

describe('recommend — 도보시간', () => {
  it('정류장까지 걸어가는 동안 지나가는 버스는 제외', () => {
    const r = recommend(
      input(
        arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190', { carNo: '4135', min: 2 }, { carNo: '4152', min: 6 }) +
          arrItem(ROUTE_10, SEOMYEON_LOTTE, '05190', { carNo: '1001', min: 1 }),
        { segment: segment({ walkMin: { [SEOMYEON_LOTTE]: 3 } }) },
      ),
    );
    expect(r.candidates).toHaveLength(1);
    expect(r.best?.bus.carNo).toBe('4152');
    expect(r.best?.busIndex).toBe(1);
    expect(r.best?.congestion.gapRatio).toBeCloseTo(0.8); // (6-2)/5
    expect(r.waitForNext).toBeNull();
  });

  it('도보시간과 같은 시각에 오는 버스는 탈 수 있음', () => {
    const r = recommend(
      input(arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190', { carNo: '4135', min: 3 }), {
        segment: segment({ walkMin: { [SEOMYEON_LOTTE]: 3 } }),
      }),
    );
    expect(r.best?.bus.carNo).toBe('4135');
  });

  it('도보시간은 출발 정류장별로 적용', () => {
    const r = recommend(
      input(
        arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190', { carNo: '4135', min: 2 }) +
          arrItem(ROUTE_20, LOTTE_SEOMYEON, '05237', { carNo: '2001', min: 2 }),
        {
          segment: segment({
            fromStopIds: [SEOMYEON_LOTTE, LOTTE_SEOMYEON],
            walkMin: { [SEOMYEON_LOTTE]: 5, [LOTTE_SEOMYEON]: 1 },
          }),
        },
      ),
    );
    expect(r.candidates.map((c) => c.routeNo)).toEqual(['20']);
  });
});

describe('recommend — 정류장 방향', () => {
  it('반대 방향 정류장(같은 이름)에서는 후보가 없다', () => {
    // 서면한전 회차 후 정류장(31번째) → 부전시장(26번째): 순번이 거꾸로
    const r = recommend(
      input(arrItem(ROUTE_83, HANJEON_BACK, '05xxx', { carNo: '4135', min: 2 }), {
        segment: segment({ fromStopIds: [HANJEON_BACK] }),
      }),
    );
    expect(r.best).toBeNull();
    expect(r.reason).toBe('두 정류장을 같은 방향으로 지나는 노선이 없습니다. 정류장 방향과 이용 노선 설정을 확인하세요.');
  });

  it('양쪽 정류장을 모두 지정해도 맞는 방향만 후보', () => {
    const r = recommend(
      input(
        arrItem(ROUTE_83, HANJEON_OUT, '05xxx', { carNo: '4135', min: 3 }) +
          arrItem(ROUTE_83, HANJEON_BACK, '05yyy', { carNo: '4170', min: 1 }),
        { segment: segment({ fromStopIds: [HANJEON_OUT, HANJEON_BACK] }) },
      ),
    );
    expect(r.candidates).toHaveLength(1);
    expect(r.best?.fromStopId).toBe(HANJEON_OUT);
    expect(r.best?.rideStops).toBe(4); // 22 → 26
    expect(r.best?.rideMin).toBe(8);
  });
});

describe('recommend — 프로필 없음', () => {
  it('간격비만으로 단계 산출', () => {
    const r = recommend(input(arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190', { carNo: '4135', min: 9 })));
    expect(r.best?.congestion).toEqual({ level: 3, baseline: null, gapRatio: 1.8, estimated: true });
  });

  it('간격비도 없으면 보통(1)', () => {
    const r = recommend(input(arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190', { carNo: '4135', min: 3 })));
    expect(r.best?.congestion).toEqual({ level: 1, baseline: null, gapRatio: null, estimated: true });
  });

  it('프로필에 해당 노선이 없으면 간격비만 사용', () => {
    const r = recommend(
      input(arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190', { carNo: '4135', min: 3 }), {
        profile: flatProfile({ '10': { '10': 70 } }),
      }),
    );
    expect(r.best?.congestion.baseline).toBeNull();
    expect(r.best?.congestion.level).toBe(1);
  });

  it('프로필과 간격비가 둘 다 있으면 결합', () => {
    // 평소 50명(혼잡) + 앞차에 바짝 붙은 2번째 차(여유) → 보통
    const r = recommend(
      input(arrItem(ROUTE_83, SEOMYEON_LOTTE, '05190', { carNo: '4135', min: 2 }, { carNo: '4152', min: 3 }), {
        profile: flatProfile({ '83': { '24': 300 } }),
        segment: segment({ walkMin: { [SEOMYEON_LOTTE]: 3 } }),
      }),
    );
    expect(r.best?.busIndex).toBe(1);
    expect(r.best?.congestion).toEqual({ level: 1, baseline: 50, gapRatio: 0.2, estimated: true });
  });
});

describe('recommend — 왕복 노선의 반대편 도착 정류장', () => {
  it('같은 노선·출발 정류장이면 가장 가까운 도착 정류장 하나만 후보', () => {
    const route: Route = {
      id: 'R1',
      no: '1',
      type: '일반버스',
      stops: [
        { stopId: 'A', seq: 1, name: '출발' },
        { stopId: 'B1', seq: 2, name: '도착' },
        { stopId: 'X', seq: 3, name: '회차' },
        { stopId: 'B2', seq: 4, name: '도착' },
      ],
      headway: { peak: 10, normal: 10, holiday: 10 },
      firstTime: '05:00',
      lastTime: '23:00',
    };
    const r = recommend({
      segment: { id: 's', name: 's', fromStopIds: ['A'], toStopIds: ['B2', 'B1'], routeFilter: [], schedule: null, maxWaitMin: 15, walkMin: {} },
      arrivals: [{ stopId: 'A', routeId: 'R1', routeNo: '1', stopSeq: 1, buses: [{ carNo: 'c', etaMin: 3, stopsAway: 1, lowFloor: false }], fetchedAt: '' }],
      routes: { R1: route },
      profile: null,
      now: new Date('2026-10-21T13:00:00+09:00'),
    });
    expect(r.candidates.map((c) => [c.toStopId, c.rideStops])).toEqual([['B1', 1]]);
  });
});
