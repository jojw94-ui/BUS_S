import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { Route, RouteId, Stop } from '@bus-s/core';
import { getStopArrivals, type StopArrivals } from '../api/bims';
import { REFRESH_INTERVAL_MS } from '../config';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { loadRoutes, towardsNames } from '../lib/routes';
import { ArrivalList } from './ArrivalList';
import { Button, Card, colors, ErrorText, Loading, Muted } from './ui';

/**
 * 정류장 1곳의 상세: 이름·ARS번호·"OO 방면"·실시간 도착정보.
 * onPick 이 있으면 방향을 확인하고 고르는 버튼을 보여 준다 (구간 설정용).
 */
export function StopDetail({ stop, onPick, active = true }: { stop: Stop; onPick?: (s: Stop) => void; active?: boolean }) {
  const [data, setData] = useState<StopArrivals | null>(null);
  const [routes, setRoutes] = useState<Record<RouteId, Route>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      try {
        const res = await getStopArrivals(stop.id, force);
        setData(res);
        setError(null);
        // 방면 계산용 노선 정보 (6시간 캐시)
        loadRoutes(res.arrivals.map((a) => a.routeId)).then(setRoutes);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [stop.id],
  );

  useEffect(() => {
    setData(null);
    setRoutes({});
    load();
  }, [load]);
  useAutoRefresh(() => load(), REFRESH_INTERVAL_MS, active);

  const towards = data ? towardsNames(stop.id, data.arrivals, routes) : [];
  const towardsText = stop.towards ?? (towards.length ? towards.slice(0, 2).join(', ') : null);

  return (
    <View>
      <Card>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{stop.name}</Text>
        <Muted>
          {stop.arsNo ? `ARS ${stop.arsNo} · ` : ''}정류소ID {stop.id}
        </Muted>
        <Text style={{ fontSize: 16, marginTop: 8, color: towardsText ? colors.primary : colors.sub, fontWeight: '600' }}>
          {towardsText ? `${towardsText} 방면` : data ? '방면 확인 중… (노선 정보 불러오는 중)' : ' '}
        </Text>
        {onPick ? (
          <View style={{ marginTop: 10 }}>
            <Muted>같은 이름의 정류장이 길 건너편에도 있습니다. 방면과 도착 노선을 확인하세요.</Muted>
            <Button title="이 방향 정류장 선택" onPress={() => onPick({ ...stop, towards: towardsText ?? stop.towards })} style={{ marginTop: 8 }} />
          </View>
        ) : null}
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>실시간 도착정보</Text>
          <Button title="새로고침" kind="plain" onPress={() => load(true)} disabled={loading} />
        </View>
        {error ? <ErrorText>{error}</ErrorText> : null}
        {!data && loading ? <Loading /> : null}
        {data ? (
          <>
            <Muted>{new Date(data.arrivals[0]?.fetchedAt ?? Date.now()).toLocaleTimeString('ko-KR')} 기준 · 30초마다 갱신</Muted>
            <ArrivalList arrivals={data.arrivals} busTypes={data.busTypes} />
          </>
        ) : null}
      </Card>
    </View>
  );
}
