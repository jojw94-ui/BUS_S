import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import type { LatLng } from '@bus-s/core';

/**
 * 출발·도착 방향 자동 전환용 현재 위치. 화면이 보일 때 한 번 가져온다.
 * 권한이 없거나 실패하면 null — 그때는 시간대로 방향을 정한다.
 */
export function usePosition(active: boolean): LatLng | null {
  const [pos, setPos] = useState<LatLng | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        let perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted' && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;
        const last = await Location.getLastKnownPositionAsync();
        if (last && !cancelled) setPos({ lat: last.coords.latitude, lng: last.coords.longitude });
        const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) setPos({ lat: cur.coords.latitude, lng: cur.coords.longitude });
      } catch {
        // 위치를 못 얻으면 시간대로 판단
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  return pos;
}
