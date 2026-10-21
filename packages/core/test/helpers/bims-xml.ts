// 테스트 전용: BIMS XML 응답(data/samples 형태)을 core 입력 타입으로 바꾼다.
// 실제 변환 모듈은 app/src/api/ 담당이며, 여기서는 픽스처를 실제 응답 형태로 쓰기 위해서만 쓴다.
import type { Arrival, ArrivalBus, RouteStop } from '../../src/types';

type Item = Record<string, string>;

export function parseItems(xml: string): Item[] {
  const items: Item[] = [];
  for (const [, body] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item: Item = {};
    for (const [, key, value] of body.matchAll(/<(\w+)>([^<]*)<\/\1>/g)) item[key] = value.trim();
    items.push(item);
  }
  return items;
}

/** stopArrByBstopid / bitArrByArsno 응답 → Arrival[] (carnoN 이 있는 버스만) */
export function parseStopArrivals(xml: string, fetchedAt = '2026-10-21T08:00:00+09:00'): Arrival[] {
  return parseItems(xml).map((item) => {
    const buses: ArrivalBus[] = [];
    for (const n of [1, 2]) {
      if (!item[`carno${n}`]) continue;
      buses.push({
        carNo: item[`carno${n}`],
        etaMin: Number(item[`min${n}`]),
        stopsAway: Number(item[`station${n}`]),
        lowFloor: item[`lowplate${n}`] === '1',
      });
    }
    return {
      stopId: item.bstopid,
      routeId: item.lineid,
      routeNo: item.lineno,
      stopSeq: Number(item.bstopidx),
      buses,
      fetchedAt,
    };
  });
}

/** busInfoByRouteId 응답 → RouteStop[] */
export function parseRouteStops(xml: string): RouteStop[] {
  return parseItems(xml).map((item) => ({
    stopId: item.nodeid,
    seq: Number(item.bstopidx),
    name: item.bstopnm,
  }));
}

/** stopArrByBstopid 응답 형태로 감싼다 */
export function stopArrXml(items: string): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<response>
<header>
<resultCode>00</resultCode>
<resultMsg>NORMAL SERVICE</resultMsg>
</header>
<body>
<items>
${items}
</items>
</body>
</response>`;
}
