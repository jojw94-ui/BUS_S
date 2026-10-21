// 부산 BIMS Open API 호출 모듈. 필드 의미는 docs/api-notes/busan-bims.md (실측) 기준.
import type { Arrival, ArrivalBus, Route, RouteId, Stop, StopId } from '@bus-s/core';
import { ARRIVAL_CACHE_TTL_MS, ROUTE_CACHE_TTL_MS, STOP_SEARCH_CACHE_TTL_MS } from '../config';
import { TtlCache } from './cache';
import { BimsError, parseBimsItems, type XmlItem } from './xml';

const BASE_URL = 'https://apis.data.go.kr/6260000/BusanBIMS';

/** 앱에 들어 있는 키 (app/.env → 빌드 시 포함). 다른 사람에게 줄 APK 는 비워서 빌드할 수 있다. */
const BUILTIN_KEY = process.env.EXPO_PUBLIC_BUSAN_BIMS_API_KEY || null;
/** 사용자가 설정에서 입력한 키 — 앱 시작 시 저장소에서 읽어 setUserApiKey 로 넣는다 */
let userKey: string | null = null;

export function setUserApiKey(key: string | null): void {
  userKey = key;
}

/** 지금 쓰는 키의 출처 */
export function apiKeySource(): 'user' | 'builtin' | 'none' {
  return userKey ? 'user' : BUILTIN_KEY ? 'builtin' : 'none';
}

function apiKey(): string {
  const key = userKey ?? BUILTIN_KEY;
  if (!key) throw new BimsError('API 키가 없습니다. [구간 설정] 탭 아래 "API 키"에서 공공데이터포털 인증키를 입력하세요.');
  return key;
}

async function call(path: string, params: Record<string, string>, key: string = apiKey()): Promise<XmlItem[]> {
  // Decoding 키를 쓰므로 serviceKey 를 직접 인코딩한다.
  const query = Object.entries({ serviceKey: key, ...params })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}?${query}`);
  } catch {
    throw new BimsError('네트워크에 연결할 수 없습니다');
  }
  const text = await res.text();
  if (!res.ok) {
    // 인증 오류(등록되지 않은 키 등)는 HTTP 403 과 함께 사유가 담긴 XML 이 온다 — 그 사유를 보여 준다
    try {
      parseBimsItems(text);
    } catch (e) {
      if (e instanceof BimsError && e.message.startsWith('API 오류')) throw e;
    }
    throw new BimsError(`API 요청 실패 (HTTP ${res.status})`);
  }
  return parseBimsItems(text);
}

const num = (v: string | undefined): number => (v === undefined || v === '' ? NaN : Number(v));

// ── 정류소 도착정보 (stopArrByBstopid) ───────────────────────────

export interface StopArrivals {
  stopId: StopId;
  arrivals: Arrival[];
  /** 응답 행에 함께 오는 정류장 정보 (행이 없으면 null) */
  stop: Stop | null;
  /** routeId → bustype (일반버스·급행버스 등) */
  busTypes: Record<RouteId, string>;
}

function toBus(item: XmlItem, n: 1 | 2): ArrivalBus | null {
  // 버스가 없으면 carnoN/minN 등 필드 자체가 빠진다 (실측)
  const etaMin = num(item[`min${n}`]);
  if (!item[`carno${n}`] || Number.isNaN(etaMin)) return null;
  return {
    carNo: item[`carno${n}`]!,
    etaMin,
    stopsAway: num(item[`station${n}`]),
    lowFloor: item[`lowplate${n}`] === '1',
  };
}

export function toStopArrivals(stopId: StopId, items: XmlItem[], fetchedAt: string): StopArrivals {
  const busTypes: Record<RouteId, string> = {};
  const arrivals: Arrival[] = items.map((item) => {
    const routeId = item.lineid ?? '';
    if (item.bustype) busTypes[routeId] = item.bustype;
    const buses = [toBus(item, 1), toBus(item, 2)]
      .filter((b): b is ArrivalBus => b !== null)
      .sort((a, b) => a.etaMin - b.etaMin);
    return {
      stopId: item.bstopid ?? stopId,
      routeId,
      routeNo: item.lineno ?? '',
      stopSeq: num(item.bstopidx),
      buses,
      fetchedAt,
    };
  });
  const first = items[0];
  const stop: Stop | null = first
    ? {
        id: first.bstopid ?? stopId,
        arsNo: first.arsno ?? '',
        name: first.nodenm ?? '',
        lat: num(first.gpsy),
        lng: num(first.gpsx),
      }
    : null;
  return { stopId, arrivals, stop, busTypes };
}

const arrivalCache = new TtlCache<StopArrivals>(ARRIVAL_CACHE_TTL_MS);

/** 정류장 1곳의 모든 노선 1·2번째 버스 도착정보. 20초 캐시, force=true 면 캐시 무시. */
export function getStopArrivals(stopId: StopId, force = false): Promise<StopArrivals> {
  return arrivalCache.getOrLoad(
    stopId,
    async () => toStopArrivals(stopId, await call('/stopArrByBstopid', { bstopid: stopId }), new Date().toISOString()),
    force,
  );
}

// ── 정류소 정보 (busStopList) ────────────────────────────────────

export function toStop(item: XmlItem): Stop {
  return {
    id: item.bstopid ?? '',
    arsNo: item.arsno ?? '',
    name: item.bstopnm ?? '',
    lat: num(item.gpsy),
    lng: num(item.gpsx),
  };
}

const stopSearchCache = new TtlCache<Stop[]>(STOP_SEARCH_CACHE_TTL_MS);

/** 정류장 이름(부분일치) 또는 ARS번호(5자리)로 검색 */
export function searchStops(query: string): Promise<Stop[]> {
  const q = query.trim();
  if (!q) return Promise.resolve([]);
  const params: Record<string, string> = /^\d{5}$/.test(q) ? { arsno: q } : { bstopnm: q };
  return stopSearchCache.getOrLoad(q, async () =>
    (await call('/busStopList', { ...params, numOfRows: '100', pageNo: '1' })).map(toStop).filter((s) => s.id),
  );
}

// ── 노선 정보 (busInfoByRouteId + busInfo) ───────────────────────

export function toRoute(routeId: RouteId, stopItems: XmlItem[], infoItems: XmlItem[]): Route | null {
  // busInfo 는 lineid 로 조회해도 정확히 일치하는 행만 쓴다
  const info = infoItems.find((i) => i.lineid === routeId);
  if (!info || stopItems.length === 0) return null;
  return {
    id: routeId,
    // busInfo 의 노선번호 필드는 buslinenum (실측)
    no: info.buslinenum ?? stopItems[0].lineno ?? '',
    type: info.bustype ?? '',
    stops: stopItems
      .map((s) => ({ stopId: s.nodeid ?? '', seq: num(s.bstopidx), name: s.bstopnm ?? '' }))
      .sort((a, b) => a.seq - b.seq),
    headway: {
      peak: num(info.headwaypeak),
      normal: num(info.headwaynorm),
      holiday: num(info.headwayholi),
    },
    firstTime: info.firsttime ?? '',
    lastTime: info.endtime ?? '',
  };
}

const routeCache = new TtlCache<Route | null>(ROUTE_CACHE_TTL_MS);

/** 노선 경유 정류장 + 배차 정보. data/static/routes.json 이 생기기 전까지 API 로 채운다. */
export function getRoute(routeId: RouteId): Promise<Route | null> {
  return routeCache.getOrLoad(routeId, async () => {
    const [stopItems, infoItems] = await Promise.all([
      call('/busInfoByRouteId', { lineid: routeId }),
      call('/busInfo', { lineid: routeId }),
    ]);
    return toRoute(routeId, stopItems, infoItems);
  });
}

export { BimsError };

// ── API 키 확인 ─────────────────────────────────────────────────

/**
 * 키가 실제로 동작하는지 정류소 1곳(서면역.서면지하상가, ARS 05711)을 조회해 확인한다. 캐시를 쓰지 않는다.
 * 실패하면 BimsError (예: 등록되지 않은 키 — 포털 승인 직후에는 1~2시간 뒤부터 동작).
 */
export async function testApiKey(key: string): Promise<void> {
  const items = await call('/busStopList', { arsno: '05711', pageNo: '1', numOfRows: '1' }, key);
  if (items.length === 0) throw new BimsError('응답은 왔지만 정류장 정보가 비어 있습니다');
}
