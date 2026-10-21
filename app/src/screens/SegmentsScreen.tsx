import { useState } from 'react';
import { Modal, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import type { CommuteSegment, Stop, StopId } from '@bus-s/core';
import { Button, Card, Chip, colors, ErrorText, Muted, SectionTitle, styles } from '../components/ui';
import { DEFAULT_MAX_WAIT_MIN, DEFAULT_WALK_MIN } from '../config';
import { DAY_LABELS, describeSchedule, isValidTime } from '../lib/schedule';
import { exportJson, importJson, newSegmentId } from '../storage/segments';
import { StopSearchScreen } from './StopSearchScreen';

/** ② 출퇴근 구간 목록 + 편집 + 내보내기/가져오기 */
export function SegmentsScreen({
  segments,
  knownStops,
  onSave,
  onReload,
}: {
  segments: CommuteSegment[];
  knownStops: Record<StopId, Stop>;
  /** 구간 목록 저장 + 새로 고른 정류장 기억 */
  onSave: (segments: CommuteSegment[], pickedStops: Stop[]) => Promise<void>;
  /** 가져오기 후 저장소에서 다시 읽기 */
  onReload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<CommuteSegment | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  if (editing) {
    return (
      <SegmentEditor
        initial={editing}
        knownStops={knownStops}
        onCancel={() => setEditing(null)}
        onDelete={async () => {
          await onSave(segments.filter((s) => s.id !== editing.id), []);
          setEditing(null);
        }}
        onSubmit={async (seg, picked) => {
          const exists = segments.some((s) => s.id === seg.id);
          await onSave(exists ? segments.map((s) => (s.id === seg.id ? seg : s)) : [...segments, seg], picked);
          setEditing(null);
        }}
      />
    );
  }

  const stopNames = (ids: StopId[]) => ids.map((id) => knownStops[id]?.name ?? id).join(', ') || '없음';

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {segments.length === 0 ? <Muted>아직 구간이 없습니다. 출근·퇴근 구간을 추가하세요.</Muted> : null}
      {segments.map((s) => (
        <Pressable key={s.id} onPress={() => setEditing(s)}>
          <Card>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{s.name}</Text>
            <Muted>{describeSchedule(s)} · 최대 대기 {s.maxWaitMin}분</Muted>
            <Text style={{ marginTop: 4, color: colors.text }}>출발: {stopNames(s.fromStopIds)}</Text>
            <Text style={{ color: colors.text }}>도착: {stopNames(s.toStopIds)}</Text>
            <Muted>노선: {s.routeFilter.length ? s.routeFilter.join(', ') : '자동(후보 전부)'}</Muted>
          </Card>
        </Pressable>
      ))}
      <Button title="+ 구간 추가" onPress={() => setEditing(emptySegment())} />

      <SectionTitle>백업</SectionTitle>
      <View style={[styles.row, { gap: 8 }]}>
        <Button
          title="JSON 내보내기"
          kind="plain"
          style={{ flex: 1 }}
          onPress={async () => {
            await Share.share({ title: 'BUS_S 구간 설정', message: await exportJson() });
          }}
        />
        <Button title="JSON 가져오기" kind="plain" style={{ flex: 1 }} onPress={() => setImportOpen(true)} />
      </View>
      <ImportModal
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={async () => {
          await onReload();
          setImportOpen(false);
        }}
      />
    </ScrollView>
  );
}

function emptySegment(): CommuteSegment {
  return {
    id: newSegmentId(),
    name: '',
    fromStopIds: [],
    toStopIds: [],
    routeFilter: [],
    schedule: { days: [1, 2, 3, 4, 5], start: '07:00', end: '09:00' },
    maxWaitMin: DEFAULT_MAX_WAIT_MIN,
    walkMin: {},
  };
}

function ImportModal({ visible, onClose, onImported }: { visible: boolean; onClose: () => void; onImported: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, padding: 16, paddingTop: 48, backgroundColor: colors.bg }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>JSON 가져오기</Text>
        <Muted>내보낸 JSON 을 붙여 넣으세요. 기존 구간은 모두 교체됩니다.</Muted>
        <TextInput
          style={[styles.input, { flex: 1, marginVertical: 12, textAlignVertical: 'top' }]}
          multiline
          value={text}
          onChangeText={setText}
          placeholder='{"app":"bus-s", ...}'
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <View style={[styles.row, { gap: 8 }]}>
          <Button title="취소" kind="plain" style={{ flex: 1 }} onPress={onClose} />
          <Button
            title="가져오기"
            style={{ flex: 1 }}
            onPress={async () => {
              try {
                await importJson(text);
                setText('');
                setError(null);
                onImported();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

type PickTarget = 'from' | 'to' | null;

function SegmentEditor({
  initial,
  knownStops,
  onCancel,
  onDelete,
  onSubmit,
}: {
  initial: CommuteSegment;
  knownStops: Record<StopId, Stop>;
  onCancel: () => void;
  onDelete: () => void;
  onSubmit: (seg: CommuteSegment, picked: Stop[]) => void;
}) {
  const [seg, setSeg] = useState<CommuteSegment>(initial);
  const [picked, setPicked] = useState<Record<StopId, Stop>>({});
  const [pickTarget, setPickTarget] = useState<PickTarget>(null);
  const [routeText, setRouteText] = useState(initial.routeFilter.join(', '));
  const [error, setError] = useState<string | null>(null);

  const stops = { ...knownStops, ...picked };
  const update = (patch: Partial<CommuteSegment>) => setSeg((s) => ({ ...s, ...patch }));

  const addStop = (stop: Stop) => {
    setPicked((p) => ({ ...p, [stop.id]: stop }));
    if (pickTarget === 'from') {
      if (!seg.fromStopIds.includes(stop.id)) {
        update({
          fromStopIds: [...seg.fromStopIds, stop.id],
          walkMin: { ...seg.walkMin, [stop.id]: seg.walkMin[stop.id] ?? DEFAULT_WALK_MIN },
        });
      }
    } else if (pickTarget === 'to' && !seg.toStopIds.includes(stop.id)) {
      update({ toStopIds: [...seg.toStopIds, stop.id] });
    }
    setPickTarget(null);
  };

  const removeStop = (which: 'from' | 'to', id: StopId) => {
    if (which === 'from') {
      const { [id]: _, ...walk } = seg.walkMin;
      update({ fromStopIds: seg.fromStopIds.filter((x) => x !== id), walkMin: walk });
    } else {
      update({ toStopIds: seg.toStopIds.filter((x) => x !== id) });
    }
  };

  const submit = () => {
    if (!seg.name.trim()) return setError('구간 이름을 입력하세요');
    if (seg.fromStopIds.length === 0 || seg.toStopIds.length === 0) return setError('출발·도착 정류장을 하나 이상 고르세요');
    if (seg.schedule && (!isValidTime(seg.schedule.start) || !isValidTime(seg.schedule.end)))
      return setError('시간은 HH:MM 형식으로 입력하세요 (예: 07:30)');
    if (seg.schedule && seg.schedule.days.length === 0) return setError('요일을 하나 이상 고르세요');
    if (!(seg.maxWaitMin > 0)) return setError('최대 대기시간을 입력하세요');
    const routeFilter = routeText
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    onSubmit({ ...seg, name: seg.name.trim(), routeFilter }, Object.values(picked));
  };

  const stopRow = (which: 'from' | 'to', id: StopId) => {
    const s = stops[id];
    return (
      <View key={id} style={[styles.row, { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 8 }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, color: colors.text }}>{s?.name ?? id}</Text>
          <Muted>
            {s?.towards ? `${s.towards} 방면 · ` : ''}
            {s?.arsNo ? `ARS ${s.arsNo}` : `ID ${id}`}
          </Muted>
        </View>
        {which === 'from' ? (
          <View style={[styles.row, { gap: 4 }]}>
            <Muted>도보</Muted>
            <TextInput
              style={[styles.input, { width: 48, paddingVertical: 4, textAlign: 'center' }]}
              keyboardType="number-pad"
              value={String(seg.walkMin[id] ?? 0)}
              onChangeText={(t) => update({ walkMin: { ...seg.walkMin, [id]: Number(t.replace(/\D/g, '')) || 0 } })}
            />
            <Muted>분</Muted>
          </View>
        ) : null}
        <Button title="삭제" kind="danger" onPress={() => removeStop(which, id)} />
      </View>
    );
  };

  const schedule = seg.schedule;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <SectionTitle>구간 이름</SectionTitle>
      <TextInput style={styles.input} placeholder="출근, 퇴근, 본가…" value={seg.name} onChangeText={(name) => update({ name })} />

      <SectionTitle>출발 정류장 (여러 곳 가능)</SectionTitle>
      <Card>
        {seg.fromStopIds.map((id) => stopRow('from', id))}
        <Button title="+ 출발 정류장 추가" kind="plain" onPress={() => setPickTarget('from')} style={{ marginTop: 8 }} />
      </Card>

      <SectionTitle>도착 정류장 (여러 곳 가능)</SectionTitle>
      <Card>
        {seg.toStopIds.map((id) => stopRow('to', id))}
        <Button title="+ 도착 정류장 추가" kind="plain" onPress={() => setPickTarget('to')} style={{ marginTop: 8 }} />
      </Card>

      <SectionTitle>이용 노선 (비우면 자동 — 후보 전부)</SectionTitle>
      <TextInput style={styles.input} placeholder="예: 83, 1001" value={routeText} onChangeText={setRouteText} />

      <SectionTitle>자동 선택 시간대</SectionTitle>
      <Card>
        <View style={[styles.row, { flexWrap: 'wrap' }]}>
          <Chip label="시간대 사용" active={!!schedule} onPress={() => update({ schedule: schedule ? null : emptySegment().schedule })} />
        </View>
        {schedule ? (
          <>
            <View style={[styles.row, { flexWrap: 'wrap', marginTop: 4 }]}>
              {DAY_LABELS.map((label, d) => (
                <Chip
                  key={label}
                  label={label}
                  active={schedule.days.includes(d)}
                  onPress={() =>
                    update({
                      schedule: {
                        ...schedule,
                        days: schedule.days.includes(d) ? schedule.days.filter((x) => x !== d) : [...schedule.days, d].sort(),
                      },
                    })
                  }
                />
              ))}
            </View>
            <View style={[styles.row, { gap: 8, marginTop: 4 }]}>
              <TextInput
                style={[styles.input, { width: 80, textAlign: 'center' }]}
                value={schedule.start}
                onChangeText={(start) => update({ schedule: { ...schedule, start } })}
                placeholder="07:00"
              />
              <Text>~</Text>
              <TextInput
                style={[styles.input, { width: 80, textAlign: 'center' }]}
                value={schedule.end}
                onChangeText={(end) => update({ schedule: { ...schedule, end } })}
                placeholder="09:00"
              />
            </View>
          </>
        ) : (
          <Muted>시간대 없이 홈에서 직접 골라 씁니다.</Muted>
        )}
      </Card>

      <SectionTitle>최대 대기시간 (분)</SectionTitle>
      <TextInput
        style={[styles.input, { width: 80 }]}
        keyboardType="number-pad"
        value={String(seg.maxWaitMin || '')}
        onChangeText={(t) => update({ maxWaitMin: Number(t.replace(/\D/g, '')) || 0 })}
      />

      {error ? <ErrorText>{error}</ErrorText> : null}
      <View style={[styles.row, { gap: 8, marginTop: 16 }]}>
        <Button title="취소" kind="plain" style={{ flex: 1 }} onPress={onCancel} />
        <Button title="저장" style={{ flex: 1 }} onPress={submit} />
      </View>
      {initial.name ? <Button title="이 구간 삭제" kind="danger" onPress={onDelete} style={{ marginTop: 12 }} /> : null}

      <Modal visible={pickTarget !== null} animationType="slide" onRequestClose={() => setPickTarget(null)}>
        <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 40 }}>
          <View style={[styles.row, { justifyContent: 'space-between', paddingHorizontal: 16 }]}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
              {pickTarget === 'from' ? '출발' : '도착'} 정류장 고르기
            </Text>
            <Button title="닫기" kind="plain" onPress={() => setPickTarget(null)} />
          </View>
          <StopSearchScreen onPick={addStop} active={pickTarget !== null} />
        </View>
      </Modal>
    </ScrollView>
  );
}
