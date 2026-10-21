// 실제 데이터로 추천 전체 흐름을 점검한다: 정적 정류장·노선·혼잡도 프로필 + 실시간 도착정보 + core recommend.
// 실행: npm run check:recommend -w @bus-s/app -- [출발 정류장 이름] [도착 정류장 이름]
//   예) npm run check:recommend -w @bus-s/app -- 서면역 부산역
// 이름이 포함된 정류장을 모두 출발/도착 후보로 넣는다 (출퇴근 구간에 정류장을 여러 개 넣는 것과 같다).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(__dirname, '../.env');
for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const { getStopArrivals } = await import('../src/api/bims');
  const { loadRoutes } = await import('../src/lib/routes');
  const { recommend, usingCoreRecommend } = await import('../src/lib/recommend');
  const { localStops } = await import('../src/data/stops');
  const { congestionProfile } = await import('../src/data/profile');
  const { CONGESTION_LABELS } = await import('@bus-s/core');
  type CommuteSegment = import('@bus-s/core').CommuteSegment;

  const fromName = process.argv[2] ?? '서면역';
  const toName = process.argv[3] ?? '부산역';
  const fromStops = localStops.filter((s) => s.name.includes(fromName));
  const toStops = localStops.filter((s) => s.name.includes(toName));
  console.log(`출발 '${fromName}' ${fromStops.length}곳, 도착 '${toName}' ${toStops.length}곳`);

  const segment: CommuteSegment = {
    id: 'check',
    name: '점검',
    fromStopIds: fromStops.map((s) => s.id),
    toStopIds: toStops.map((s) => s.id),
    routeFilter: [],
    schedule: null,
    maxWaitMin: 15,
    walkMin: {},
  };

  const results = await Promise.all(fromStops.map((s) => getStopArrivals(s.id)));
  const arrivals = results.flatMap((r) => r.arrivals);
  const routes = await loadRoutes(arrivals.map((a) => a.routeId));
  const rec = recommend({ segment, arrivals, routes, profile: congestionProfile, now: new Date() });

  const name = (id: string) => localStops.find((s) => s.id === id)?.name ?? id;
  console.log(`core 추천 사용: ${usingCoreRecommend}, 도착정보 ${arrivals.length}행, 노선 ${Object.keys(routes).length}개`);
  console.log(`\n추천: ${rec.reason}`);
  if (rec.waitForNext) console.log(`다음 차: ${rec.waitForNext.routeNo}번 ${rec.waitForNext.bus.etaMin}분 후`);
  console.log('\n후보 (추천 순)');
  for (const c of rec.candidates) {
    const g = c.congestion;
    console.log(
      `  ${c.routeNo.padEnd(6)} ${name(c.fromStopId)} → ${name(c.toStopId)}  ${c.bus.etaMin}분 후 · ${c.rideStops}정류장 · 총 ${c.totalMin}분 · ` +
        `추정 ${CONGESTION_LABELS[g.level]} (평소 대당 ${g.baseline ?? '-'}명, 간격비 ${g.gapRatio?.toFixed(2) ?? '-'})`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
