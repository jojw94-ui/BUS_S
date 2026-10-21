import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Location from 'expo-location';
import type { Stop } from '@bus-s/core';
import { NEARBY_RADIUS_M } from '../config';
import { LOCAL_STOPS_IS_SAMPLE, nearbyStops, type NearbyStop } from '../data/stops';
import { Button, colors, ErrorText, Loading, Muted } from './ui';

/** GPS 근처 정류장 (반경 300m, 가까운 순) */
export function NearbyStops({ onSelect }: { onSelect: (s: Stop) => void }) {
  const [list, setList] = useState<NearbyStop[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const locate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setError('위치 권한이 없어 근처 정류장을 찾을 수 없습니다. 정류장 검색을 이용하세요.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setList(nearbyStops(pos.coords.latitude, pos.coords.longitude, NEARBY_RADIUS_M));
    } catch (e) {
      setError(`현재 위치를 가져오지 못했습니다: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>근처 정류장 ({NEARBY_RADIUS_M}m)</Text>
        <Button title="위치 다시 찾기" kind="plain" onPress={locate} disabled={loading} />
      </View>
      {LOCAL_STOPS_IS_SAMPLE ? <Muted>※ 정류장 전체 목록 준비 전이라 서면 일대 임시 목록으로 찾습니다.</Muted> : null}
      {loading ? <Loading label="현재 위치 확인 중…" /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {list && list.length === 0 ? <Muted>반경 안에 정류장이 없습니다. 정류장 검색을 이용하세요.</Muted> : null}
      {list?.map(({ stop, distanceM }) => (
        <Pressable
          key={stop.id}
          onPress={() => onSelect(stop)}
          style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}
        >
          <Text style={{ fontSize: 16, color: colors.text }}>{stop.name}</Text>
          <Muted>
            {Math.round(distanceM)}m{stop.arsNo ? ` · ARS ${stop.arsNo}` : ''}
            {stop.towards ? ` · ${stop.towards} 방면` : ''}
          </Muted>
        </Pressable>
      ))}
    </View>
  );
}
