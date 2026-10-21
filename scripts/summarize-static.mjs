// 정적 데이터 요약 통계 출력 (Markdown)
// 실행: node scripts/summarize-static.mjs
// - 정류장·노선 수, towards 채움률, 프로필 포함 노선/정류장 수
// - 서면·부산역 대표 노선의 출근시간(07:00~09:00) 재차인원 추정치 상위 노선
import path from 'node:path';
import { STATIC_DIR, readJson } from './lib/bims.mjs';

const stops = readJson(path.join(STATIC_DIR, 'stops.json'));
const routes = readJson(path.join(STATIC_DIR, 'routes.json'));
const profile = readJson(path.join(STATIC_DIR, 'congestion-profile.json'));

const slotOf = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const [fh, fm] = profile.firstSlot.split(':').map(Number);
  return ((h * 60 + m - (fh * 60 + fm) + 1440) % 1440) / profile.slotMinutes;
};
const slotLabel = (i) => {
  const [fh, fm] = profile.firstSlot.split(':').map(Number);
  const t = (fh * 60 + fm + i * profile.slotMinutes) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const AM = [slotOf('07:00'), slotOf('07:30'), slotOf('08:00'), slotOf('08:30')];

const byType = {};
for (const r of routes) byType[r.type] = (byType[r.type] ?? 0) + 1;
const profRoutes = Object.keys(profile.routes);
const profStops = Object.values(profile.routes).reduce((s, x) => s + Object.keys(x).length, 0);
const routeStops = routes.reduce((s, r) => s + r.stops.length, 0);

const out = [];
out.push('## 요약 통계');
out.push('');
out.push(`- 정류장: ${stops.length}개 (towards 채움 ${stops.filter((s) => s.towards).length}개 — 시내버스가 지나지 않는 정류장은 비움)`);
out.push(`- 노선: ${routes.length}개 (${Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(', ')}), 노선-정류장 ${routeStops}행`);
out.push(`- 혼잡도 프로필: 노선 ${profRoutes.length}/${routes.length}개 (${((profRoutes.length / routes.length) * 100).toFixed(1)}%), 노선-정류장 ${profStops}/${routeStops}행 (${((profStops / routeStops) * 100).toFixed(1)}%)`);

function hub(label, pattern) {
  // 이름이 pattern 에 맞는 정류장을 지나는 프로필 노선별로, 출근시간 최대 재차인원과 그 정류장·시각
  const rows = [];
  for (const r of routes) {
    const p = profile.routes[r.no];
    if (!p) continue;
    let best = null;
    for (const s of r.stops) {
      if (!pattern.test(s.name)) continue;
      const arr = p[String(s.seq)];
      if (!arr) continue;
      for (const t of AM) if (!best || arr[t] > best.v) best = { v: arr[t], stop: s, t, arr };
    }
    if (best) rows.push({ r, ...best });
  }
  rows.sort((a, b) => b.v - a.v);
  out.push('');
  out.push(`### ${label} — 출근시간(07:00~09:00) 정류장 출발 시점 재차인원 추정 상위 8개 노선`);
  out.push('');
  out.push('| 노선 | 정류장 (bstopidx, 정류소ID) | 최대 시각 | 07:00 | 07:30 | 08:00 | 08:30 |');
  out.push('|---|---|---|---:|---:|---:|---:|');
  for (const x of rows.slice(0, 8)) {
    out.push(
      `| ${x.r.no} | ${x.stop.name} (${x.stop.seq}, ${x.stop.stopId}) | ${slotLabel(x.t)} | ${AM.map((t) => Math.round(x.arr[t])).join(' | ')} |`,
    );
  }
  out.push('');
  out.push(`(${label} 이름이 들어간 정류장을 지나는 프로필 노선 ${rows.length}개 중)`);
}
hub('서면', /서면/);
hub('부산역', /부산역/);
out.push('');
out.push('- 값은 30분 슬롯 동안 해당 정류장을 출발한 승객 흐름의 누적(승차−보정하차)으로, **버스 1대의 재차인원이 아니라 슬롯 전체 합**에 가깝다. 노선 간 상대 비교용.');
console.log(out.join('\n'));
