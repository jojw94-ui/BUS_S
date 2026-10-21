import type { CommuteSegment, CongestionProfile, Route } from '../../src/types';

// 정류소 ID는 data/samples 의 실제 값
export const SEOMYEON_LOTTE = '164630302'; // 서면역.롯데호텔백화점 (05190), 83번 24번째
export const LOTTE_SEOMYEON = '164650301'; // 롯데호텔백화점.서면역 (05237)
export const BUJEON_MARKET = '164360101'; // 부전시장, 83번 26번째
export const HANJEON_OUT = '505870000'; // 서면한전, 83번 22번째 (부전시장 방면)
export const HANJEON_BACK = '505880000'; // 서면한전, 83번 31번째 (회차 후, 반대 방향)

/** 83번: busInfoByRouteId_83.xml 의 21~31번째 정류장 */
export const ROUTE_83: Route = {
  id: '5200083000',
  no: '83',
  type: '일반버스',
  stops: [
    { stopId: '509860000', seq: 21, name: '범내골역' },
    { stopId: HANJEON_OUT, seq: 22, name: '서면한전' },
    { stopId: '505860000', seq: 23, name: '서면역.서면지하상가' },
    { stopId: SEOMYEON_LOTTE, seq: 24, name: '서면역.롯데호텔백화점' },
    { stopId: '506970000', seq: 25, name: '부산진경찰서' },
    { stopId: BUJEON_MARKET, seq: 26, name: '부전시장' },
    { stopId: '164360102', seq: 27, name: '동해선부전역' },
    { stopId: '164370201', seq: 28, name: '부전역' },
    { stopId: '505800000', seq: 29, name: '부전시장.부전몰' },
    { stopId: '505850000', seq: 30, name: '서면역.서면지하상가' },
    { stopId: HANJEON_BACK, seq: 31, name: '서면한전' },
  ],
  // busInfo_83.xml: headwaypeak 5, headwaynorm 8, headwayholi 11
  headway: { peak: 5, normal: 8, holiday: 11 },
  firstTime: '05:00',
  lastTime: '22:50',
};

/** 가상 노선 10번: 서면역.롯데호텔백화점(10) → 부전시장(13), 3정거장 */
export const ROUTE_10: Route = {
  id: '5200010000',
  no: '10',
  type: '일반버스',
  stops: [
    { stopId: SEOMYEON_LOTTE, seq: 10, name: '서면역.롯데호텔백화점' },
    { stopId: '900000011', seq: 11, name: '가상정류장1' },
    { stopId: '900000012', seq: 12, name: '가상정류장2' },
    { stopId: BUJEON_MARKET, seq: 13, name: '부전시장' },
  ],
  headway: { peak: 10, normal: 12, holiday: 15 },
  firstTime: '05:30',
  lastTime: '22:30',
};

/** 가상 노선 20번: 롯데호텔백화점.서면역(5) → 부전시장(7), 2정거장 */
export const ROUTE_20: Route = {
  id: '5200020000',
  no: '20',
  type: '일반버스',
  stops: [
    { stopId: LOTTE_SEOMYEON, seq: 5, name: '롯데호텔백화점.서면역' },
    { stopId: '900000006', seq: 6, name: '가상정류장3' },
    { stopId: BUJEON_MARKET, seq: 7, name: '부전시장' },
  ],
  headway: { peak: 6, normal: 9, holiday: 12 },
  firstTime: '05:30',
  lastTime: '22:30',
};

export const ROUTES: Record<string, Route> = {
  [ROUTE_83.id]: ROUTE_83,
  [ROUTE_10.id]: ROUTE_10,
  [ROUTE_20.id]: ROUTE_20,
};

/** 2026-10-21(수) 08:00 — 평일 첨두 */
export const WEEKDAY_PEAK = new Date(2026, 9, 21, 8, 0);
/** 2026-10-21(수) 11:00 — 평일 평시 */
export const WEEKDAY_NORMAL = new Date(2026, 9, 21, 11, 0);
/** 2026-10-24(토) 08:00 — 휴일 */
export const SATURDAY = new Date(2026, 9, 24, 8, 0);

export function segment(overrides: Partial<CommuteSegment> = {}): CommuteSegment {
  return {
    id: 'work',
    name: '출근',
    fromStopIds: [SEOMYEON_LOTTE],
    toStopIds: [BUJEON_MARKET],
    routeFilter: [],
    schedule: { days: [1, 2, 3, 4, 5], start: '07:00', end: '09:30' },
    maxWaitMin: 10,
    walkMin: {},
    ...overrides,
  };
}

/** routeNo → stopSeq → 하루 내내 같은 재차인원 */
export function flatProfile(loads: Record<string, Record<string, number>>): CongestionProfile {
  const routes: CongestionProfile['routes'] = {};
  for (const [routeNo, seqs] of Object.entries(loads)) {
    routes[routeNo] = {};
    for (const [seq, load] of Object.entries(seqs)) routes[routeNo][seq] = Array(48).fill(load);
  }
  return { source: 'test', slotMinutes: 30, firstSlot: '04:00', routes };
}

interface BusSpec {
  carNo: string;
  min: number;
  station?: number;
}

/** stopArrByBstopid 의 <item> 1개 (data/samples/stopArrByBstopid_164630302.xml 과 같은 태그) */
export function arrItem(
  route: Route,
  stopId: string,
  arsno: string,
  bus1?: BusSpec,
  bus2?: BusSpec,
): string {
  const seq = route.stops.find((s) => s.stopId === stopId)?.seq ?? 0;
  const bus = (n: number, b?: BusSpec) =>
    b
      ? `<carno${n}>${b.carNo}</carno${n}>
<min${n}>${b.min}</min${n}>
<station${n}>${b.station ?? Math.max(1, Math.round(b.min / 2))}</station${n}>
<lowplate${n}>1</lowplate${n}>
<seat${n}>-1</seat${n}>`
      : '';
  return `<item>
<arsno>${arsno}</arsno>
<bstopid>${stopId}</bstopid>
<lineno>${route.no}</lineno>
<nodenm>테스트정류장</nodenm>
<bstopidx>${seq}</bstopidx>
${bus(1, bus1)}
${bus(2, bus2)}
<gpsx>129.055780198774</gpsx>
<gpsy>35.157856952035</gpsy>
<bustype>${route.type}</bustype>
<lineid>${route.id}</lineid>
</item>`;
}
