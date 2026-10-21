import type { CommuteSegment } from '@bus-s/core';

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const isValidTime = (s: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** 구간의 요일·시간대가 now 에 해당하는지. 자정을 넘는 시간대(22:00~01:00)도 처리한다. */
export function matchesSchedule(seg: CommuteSegment, now: Date): boolean {
  const s = seg.schedule;
  if (!s || !isValidTime(s.start) || !isValidTime(s.end)) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = toMin(s.start);
  const end = toMin(s.end);
  if (start <= end) return s.days.includes(now.getDay()) && cur >= start && cur < end;
  // 자정을 넘는 경우: 시작 요일 기준
  if (cur >= start) return s.days.includes(now.getDay());
  if (cur < end) return s.days.includes((now.getDay() + 6) % 7);
  return false;
}

/** 지금 시간대에 맞는 첫 구간 (없으면 null) */
export function findActiveSegment(segments: CommuteSegment[], now: Date): CommuteSegment | null {
  return segments.find((s) => matchesSchedule(s, now)) ?? null;
}

export const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function describeSchedule(seg: CommuteSegment): string {
  const s = seg.schedule;
  if (!s) return '시간대 없음';
  const days = [...s.days].sort().map((d) => DAY_LABELS[d]).join('');
  return `${days} ${s.start}~${s.end}`;
}
