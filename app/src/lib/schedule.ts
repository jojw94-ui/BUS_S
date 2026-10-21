import { scheduleMatches, segmentActive, type CommuteSegment, type Schedule } from '@bus-s/core';

export const isValidTime = (s: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** 구간의 (정방향) 요일·시간대가 now 에 해당하는지. 자정을 넘는 시간대(22:00~01:00)도 처리한다. */
export function matchesSchedule(seg: CommuteSegment, now: Date): boolean {
  return scheduleMatches(seg.schedule, now);
}

/** 지금 시간대에 맞는 첫 구간 (반대 방향 시간대 포함, 없으면 null) */
export function findActiveSegment(segments: CommuteSegment[], now: Date): CommuteSegment | null {
  return segments.find((s) => segmentActive(s, now)) ?? null;
}

export const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function describeSchedule(seg: CommuteSegment): string {
  const base = describeTimes(seg.schedule);
  return seg.reverse?.enabled ? `${base} · 반대 방향 ${describeTimes(seg.reverse.schedule)}` : base;
}

export function describeTimes(s: Schedule | null | undefined): string {
  if (!s) return '시간대 없음';
  const days = [...s.days].sort().map((d) => DAY_LABELS[d]).join('');
  return `${days} ${s.start}~${s.end}`;
}
