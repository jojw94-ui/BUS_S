import { Text, View } from 'react-native';
import type { Arrival, ArrivalBus, RouteId } from '@bus-s/core';
import { colors, Muted } from './ui';

function busText(b: ArrivalBus | undefined): string {
  if (!b) return '—';
  const away = Number.isNaN(b.stopsAway) ? '' : ` (${b.stopsAway}정류장 전)`;
  return `${b.etaMin}분${away}${b.lowFloor ? ' · 저상' : ''}`;
}

/** 정류장 1곳의 노선별 1·2번째 버스 도착정보 */
export function ArrivalList({ arrivals, busTypes }: { arrivals: Arrival[]; busTypes?: Record<RouteId, string> }) {
  if (arrivals.length === 0) return <Muted>도착 예정 정보가 없습니다</Muted>;
  const sorted = [...arrivals].sort(
    (a, b) => (a.buses[0]?.etaMin ?? Infinity) - (b.buses[0]?.etaMin ?? Infinity),
  );
  return (
    <View>
      {sorted.map((a) => (
        <View
          key={`${a.stopId}-${a.routeId}`}
          style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}
        >
          <View style={{ width: 96 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{a.routeNo}</Text>
            {busTypes?.[a.routeId] ? <Muted>{busTypes[a.routeId]}</Muted> : null}
          </View>
          <View style={{ flex: 1 }}>
            {a.buses.length === 0 ? (
              <Muted>운행 정보 없음</Muted>
            ) : (
              <>
                <Text style={{ fontSize: 15, color: colors.text }}>{busText(a.buses[0])}</Text>
                <Muted>다음 {busText(a.buses[1])}</Muted>
              </>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}
