// 근처 정류장 계산용 로컬 정류장 목록.
// 원본: data/static/stops.json (scripts/fetch-stops.mjs, 부산 전체 정류장)
import type { Stop } from '@bus-s/core';
import stopsJson from '../../../data/static/stops.json';
import { distanceM } from '../lib/geo';

export const LOCAL_STOPS_IS_SAMPLE = false;
export const localStops: Stop[] = stopsJson as Stop[];

export interface NearbyStop {
  stop: Stop;
  distanceM: number;
}

/** 좌표 기준 반경 내 정류장, 가까운 순 */
export function nearbyStops(lat: number, lng: number, radiusM: number): NearbyStop[] {
  return localStops
    .map((stop) => ({ stop, distanceM: distanceM(lat, lng, stop.lat, stop.lng) }))
    .filter((s) => s.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

/** 로컬 목록에서 이름·ARS번호로 찾기 (API 검색 실패 시 대체) */
export function searchLocalStops(query: string): Stop[] {
  const q = query.trim();
  if (!q) return [];
  return localStops.filter((s) => s.name.includes(q) || s.arsNo === q);
}
