import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  resolveDirection,
  type Arrival,
  type Candidate,
  type CommuteSegment,
  type Direction,
  type DirectionResult,
  type Recommendation,
  type RouteId,
  type Stop,
  type StopId,
} from '@bus-s/core';
import { getStopArrivals, type StopArrivals } from '../api/bims';
import { ArrivalList } from '../components/ArrivalList';
import { CongestionBadge } from '../components/CongestionBadge';
import { NearbyStops } from '../components/NearbyStops';
import { StopDetail } from '../components/StopDetail';
import { Button, Card, Chip, colors, ErrorText, Loading, Muted, SectionTitle } from '../components/ui';
import { REFRESH_INTERVAL_MS } from '../config';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { usePosition } from '../hooks/usePosition';
import { localStops, localStopsById } from '../data/stops';
import { openKakaoRoute } from '../lib/deeplink';
import { recommend, usingCoreRecommend } from '../lib/recommend';
import { loadRoutes } from '../lib/routes';
import { congestionProfile } from '../data/profile';
import { describeSchedule, findActiveSegment } from '../lib/schedule';

const NEARBY = '__nearby__';

/** ① 홈: 지금 시간대 구간의 추천. 맞는 구간이 없으면 근처 정류장. */
export function HomeScreen({
  segments,
  knownStops,
  active,
  onGoSetup,
}: {
  segments: CommuteSegment[];
  knownStops: Record<StopId, Stop>;
  active: boolean;
  onGoSetup: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null); // null = 자동
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (active) setNow(new Date());
  }, [active]);

  const auto = findActiveSegment(segments, now);
  const key = picked ?? auto?.id ?? NEARBY;
  const segment = segments.find((s) => s.id === key) ?? null;

  // 출발·도착 자동 전환: 직접 고른 방향 > GPS > 시간대 > 오전/오후
  const position = usePosition(active);
  const [manualDir, setManualDir] = useState<Record<string, Direction>>({});
  const manual = segment ? manualDir[segment.id] ?? null : null;
  const resolved = useMemo(
    () => (segment ? resolveDirection(segment, { now, stops: localStops, position, manual }) : null),
    [segment, now, position, manual],
  );
  const toggleDirection = () => {
    if (!segment || !resolved) return;
    setManualDir((m) => ({ ...m, [segment.id]: resolved.direction === 'forward' ? 'reverse' : 'forward' }));
  };
  // 반대 방향 정류장(길 건너편 등)은 구간에 저장된 정류장 목록에 없으므로 전체 정류장에서 이름을 찾는다
  const stopNames = useMemo(() => ({ ...localStopsById, ...knownStops }), [knownStops]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // flexShrink 0: 아래 세로 ScrollView 내용이 길면 이 줄이 높이 0으로 눌리는 문제 방지 (좁은 화면)
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{ padding: 12, paddingBottom: 4 }}
      >
        {segments.map((s) => (
          <Chip
            key={s.id}
            label={s.id === auto?.id ? `${s.name} ●` : s.name}
            active={key === s.id}
            onPress={() => setPicked(s.id)}
          />
        ))}
        <Chip label="근처 정류장" active={key === NEARBY} onPress={() => setPicked(NEARBY)} />
      </ScrollView>
      {segment && resolved ? (
        <SegmentView
          key={resolved.segment.id}
          segment={resolved.segment}
          baseSegment={segment}
          direction={resolved}
          onToggleDirection={toggleDirection}
          knownStops={stopNames}
          active={active}
          isAuto={segment.id === auto?.id}
        />
      ) : (
        <NearbyView
          hasSegments={segments.length > 0}
          hasActiveSegment={auto !== null && auto !== undefined}
          active={active}
          onGoSetup={onGoSetup}
        />
      )}
    </View>
  );
}

function NearbyView({
  hasSegments,
  hasActiveSegment,
  active,
  onGoSetup,
}: {
  hasSegments: boolean;
  hasActiveSegment: boolean;
  active: boolean;
  onGoSetup: () => void;
}) {
  const [stop, setStop] = useState<Stop | null>(null);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8 }}>
      {stop ? (
        <>
          <Button
            title="← 근처 정류장"
            kind="plain"
            onPress={() => setStop(null)}
            style={{ alignSelf: 'flex-start', marginBottom: 12 }}
          />
          <StopDetail stop={stop} active={active} />
        </>
      ) : (
        <>
          {/* 지금 시간대 구간이 있는데 사용자가 직접 '근처 정류장'을 고른 경우에는 안내를 띄우지 않는다 */}
          {!hasActiveSegment && (
            <Card>
              <Muted>
                {hasSegments ? '지금 시간대에 맞는 구간이 없습니다.' : '출퇴근 구간을 설정하면 앱을 열자마자 추천이 뜹니다.'}
              </Muted>
              <Button title="구간 설정하기" kind="plain" onPress={onGoSetup} style={{ marginTop: 8 }} />
            </Card>
          )}
          <Card>
            <NearbyStops onSelect={setStop} />
          </Card>
        </>
      )}
    </ScrollView>
  );
}

interface LoadState {
  rec: Recommendation;
  byStop: StopArrivals[];
  errors: string[];
  fetchedAt: Date;
}

function SegmentView({
  segment,
  baseSegment,
  direction,
  onToggleDirection,
  knownStops,
  active,
  isAuto,
}: {
  segment: CommuteSegment;
  baseSegment: CommuteSegment;
  direction: DirectionResult;
  onToggleDirection: () => void;
  knownStops: Record<StopId, Stop>;
  active: boolean;
  isAuto: boolean;
}) {
  const [state, setState] = useState<LoadState | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      const results = await Promise.allSettled(segment.fromStopIds.map((id) => getStopArrivals(id, force)));
      const byStop: StopArrivals[] = [];
      const errors: string[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') byStop.push(r.value);
        else {
          const id = segment.fromStopIds[i];
          errors.push(`${knownStops[id]?.name ?? id}: ${(r.reason as Error).message}`);
        }
      });
      const arrivals: Arrival[] = byStop.flatMap((s) => s.arrivals);
      const routeIds: RouteId[] = arrivals
        .filter((a) => segment.routeFilter.length === 0 || segment.routeFilter.includes(a.routeNo))
        .map((a) => a.routeId);
      const routes = await loadRoutes(routeIds);
      let rec: Recommendation;
      try {
        rec = recommend({ segment, arrivals, routes, profile: congestionProfile, now: new Date() });
      } catch (e) {
        rec = { best: null, waitForNext: null, candidates: [], reason: `추천 계산 오류: ${(e as Error).message}` };
      }
      setState({ rec, byStop, errors, fetchedAt: new Date() });
      setLoading(false);
    },
    [segment, knownStops],
  );

  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(() => load(), REFRESH_INTERVAL_MS, active);

  const stopName = (id: StopId) => knownStops[id]?.name ?? id;
  const best = state?.rec.best ?? null;
  const routeFrom = knownStops[best?.fromStopId ?? segment.fromStopIds[0]];
  const routeTo = knownStops[best?.toStopId ?? segment.toStopIds[0]];
  const canNavigate = !!routeFrom && !!routeTo && Number.isFinite(routeFrom.lat) && Number.isFinite(routeTo.lat);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Muted>
            {isAuto ? '지금 시간대 구간 · ' : ''}
            {describeSchedule(baseSegment)} · 최대 대기 {segment.maxWaitMin}분
          </Muted>
        </View>
        <Button title="새로고침" kind="plain" onPress={() => load(true)} disabled={loading} />
      </View>
      {direction.reason !== 'off' ? (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
                {direction.direction === 'forward' ? '정방향' : '반대 방향'} · {stopLabel(segment.fromStopIds, knownStops)} →{' '}
                {stopLabel(segment.toStopIds, knownStops)}
              </Text>
              <Muted>자동 전환: {direction.explain}</Muted>
            </View>
            <Button title="⇄ 방향 바꾸기" kind="plain" onPress={onToggleDirection} />
          </View>
        </Card>
      ) : null}
      {!state ? <Loading /> : null}
      {state?.errors.map((e) => <ErrorText key={e}>{e}</ErrorText>)}

      {state ? (
        <Card style={{ borderWidth: 2, borderColor: best ? colors.primary : colors.line }}>
          <Text style={{ fontSize: 13, color: colors.sub }}>지금 탈 버스</Text>
          {best ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
                <Text style={{ fontSize: 44, fontWeight: '800', color: colors.text }}>{best.routeNo}</Text>
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.primary }}>{best.bus.etaMin}분 후</Text>
              </View>
              <Text style={{ fontSize: 14, color: colors.text, marginBottom: 6 }}>
                {stopName(best.fromStopId)} → {stopName(best.toStopId)} · {best.rideStops}정류장
                {best.rideMin > 0 ? ` · 약 ${Math.round(best.rideMin)}분` : ''}
                {best.busIndex === 1 ? ' · 다음 차' : ''}
              </Text>
              <CongestionBadge value={best.congestion} large />
            </>
          ) : null}
          <Text style={{ fontSize: 15, color: colors.text, marginTop: 8 }}>{state.rec.reason}</Text>
          {state.rec.waitForNext ? (
            <Text style={{ fontSize: 14, color: colors.primary, marginTop: 6 }}>
              같은 노선 다음 차({state.rec.waitForNext.bus.etaMin}분 후)를 기다리는 것도 좋습니다
            </Text>
          ) : null}
          {!usingCoreRecommend ? <Muted>※ 추천 로직 준비 중 — 지금은 가장 빨리 오는 버스 순입니다.</Muted> : null}
          {canNavigate ? (
            <Button
              title="카카오맵 길안내"
              kind="plain"
              onPress={() => openKakaoRoute(routeFrom, routeTo)}
              style={{ marginTop: 10 }}
            />
          ) : null}
        </Card>
      ) : null}

      {state && state.rec.candidates.length > 1 ? (
        <>
          <SectionTitle>다른 후보</SectionTitle>
          <Card>
            {state.rec.candidates.slice(1).map((c) => (
              <CandidateRow key={`${c.routeId}-${c.fromStopId}-${c.busIndex}`} c={c} stopName={stopName} />
            ))}
          </Card>
        </>
      ) : null}

      {state?.byStop.map((s) => (
        <View key={s.stopId}>
          <SectionTitle>{stopName(s.stopId)} 도착정보</SectionTitle>
          <Card>
            <ArrivalList arrivals={s.arrivals} busTypes={s.busTypes} />
          </Card>
        </View>
      ))}
      {state ? <Muted>{state.fetchedAt.toLocaleTimeString('ko-KR')} 기준 · 화면이 켜져 있으면 30초마다 갱신</Muted> : null}
    </ScrollView>
  );
}

function CandidateRow({ c, stopName }: { c: Candidate; stopName: (id: StopId) => string }) {
  return (
    <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>
          {c.routeNo}{' '}
          <Text style={{ fontSize: 15, fontWeight: '400' }}>
            {c.bus.etaMin}분 후{c.busIndex === 1 ? ' (다음 차)' : ''}
          </Text>
        </Text>
        <CongestionBadge value={c.congestion} />
      </View>
      <Muted>
        {stopName(c.fromStopId)} → {stopName(c.toStopId)} · {c.rideStops}정류장
      </Muted>
    </View>
  );
}

/** 정류장 목록을 "서면역.서면지하상가 외 2곳" 형태로 (같은 이름은 한 번만) */
function stopLabel(ids: StopId[], stops: Record<StopId, Stop>): string {
  const names = [...new Set(ids.map((id) => stops[id]?.name ?? id))];
  return names.length > 1 ? `${names[0]} 외 ${names.length - 1}곳` : names[0] ?? '-';
}
