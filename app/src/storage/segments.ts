// 출퇴근 구간·선택한 정류장 정보를 기기(AsyncStorage)에 저장한다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CommuteSegment, Stop, StopId } from '@bus-s/core';

const SEGMENTS_KEY = 'bus-s/segments/v1';
const STOPS_KEY = 'bus-s/stops/v1';

export async function loadSegments(): Promise<CommuteSegment[]> {
  const raw = await AsyncStorage.getItem(SEGMENTS_KEY);
  if (!raw) return [];
  try {
    return parseSegments(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function saveSegments(segments: CommuteSegment[]): Promise<void> {
  await AsyncStorage.setItem(SEGMENTS_KEY, JSON.stringify(segments));
}

/** 구간에 쓴 정류장의 이름·좌표 (홈 표시·길안내용). 구간에는 ID 만 저장된다. */
export async function loadKnownStops(): Promise<Record<StopId, Stop>> {
  const raw = await AsyncStorage.getItem(STOPS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<StopId, Stop>;
  } catch {
    return {};
  }
}

export async function rememberStops(stops: Stop[]): Promise<Record<StopId, Stop>> {
  const known = await loadKnownStops();
  for (const s of stops) known[s.id] = s;
  await AsyncStorage.setItem(STOPS_KEY, JSON.stringify(known));
  return known;
}

// ── 내보내기 / 가져오기 ───────────────────────────────────────

export interface ExportFile {
  app: 'bus-s';
  version: 1;
  exportedAt: string;
  segments: CommuteSegment[];
  stops: Record<StopId, Stop>;
}

export async function exportJson(): Promise<string> {
  const file: ExportFile = {
    app: 'bus-s',
    version: 1,
    exportedAt: new Date().toISOString(),
    segments: await loadSegments(),
    stops: await loadKnownStops(),
  };
  return JSON.stringify(file, null, 2);
}

/** 내보낸 JSON(또는 CommuteSegment[] 배열)을 가져와 기존 구간을 교체한다. 가져온 구간 수를 돌려준다. */
export async function importJson(text: string): Promise<number> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON 형식이 아닙니다');
  }
  const obj = data as Partial<ExportFile>;
  const segments = parseSegments(Array.isArray(data) ? data : obj.segments);
  await saveSegments(segments);
  if (!Array.isArray(data) && obj.stops && typeof obj.stops === 'object') {
    await rememberStops(Object.values(obj.stops));
  }
  return segments.length;
}

const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

function parseSegments(v: unknown): CommuteSegment[] {
  if (!Array.isArray(v)) throw new Error('구간 목록이 없습니다');
  return v.map((s, i) => {
    const ok =
      s &&
      typeof s.id === 'string' &&
      typeof s.name === 'string' &&
      isStrArr(s.fromStopIds) &&
      isStrArr(s.toStopIds) &&
      isStrArr(s.routeFilter) &&
      typeof s.maxWaitMin === 'number' &&
      s.walkMin && typeof s.walkMin === 'object' &&
      (s.schedule === null ||
        (s.schedule && Array.isArray(s.schedule.days) && typeof s.schedule.start === 'string' && typeof s.schedule.end === 'string'));
    if (!ok) throw new Error(`${i + 1}번째 구간 형식이 올바르지 않습니다`);
    return s as CommuteSegment;
  });
}

export const newSegmentId = () => `seg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
