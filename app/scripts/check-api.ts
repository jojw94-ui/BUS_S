// 실제 BIMS API 로 app/src/api/bims.ts 를 점검한다 (앱 번들과 같은 코드).
// 실행: npm run check:api -w @bus-s/app   (app/.env 의 EXPO_PUBLIC_BUSAN_BIMS_API_KEY 사용)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(__dirname, '../.env');
for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const { getStopArrivals, getRoute, searchStops } = await import('../src/api/bims');
  const { loadRoutes, towardsNames } = await import('../src/lib/routes');
  const { recommend, usingCoreRecommend } = await import('../src/lib/recommend');

  const stopId = process.argv[2] ?? '164630302'; // 서면역.롯데호텔백화점
  const t0 = Date.now();
  const a = await getStopArrivals(stopId);
  const t1 = Date.now();
  const again = await getStopArrivals(stopId);
  console.log(`[도착정보] ${a.stop?.name} (${stopId}) 노선 ${a.arrivals.length}개, ${t1 - t0}ms, 캐시 재사용=${again === a}`);
  for (const r of a.arrivals.slice(0, 8)) {
    console.log(`  ${r.routeNo.padEnd(8)} seq${r.stopSeq}  ${r.buses.map((b) => `${b.etaMin}분(${b.stopsAway}정류장)`).join(', ') || '운행정보 없음'}`);
  }

  const found = await searchStops('서면');
  console.log(`[정류장 검색] '서면' ${found.length}곳, 예: ${found.slice(0, 3).map((s) => `${s.name}(${s.id})`).join(', ')}`);

  const routes = await loadRoutes(a.arrivals.map((r) => r.routeId));
  console.log(`[노선] ${Object.keys(routes).length}/${a.arrivals.length}개 조회`);
  console.log(`[방면] ${towardsNames(stopId, a.arrivals, routes).slice(0, 3).join(', ')} 방면`);

  // 83번 기준으로 출발 정류장 5개 뒤 정류장을 도착지로 한 구간
  const r83 = await getRoute('5200083000');
  const from = r83?.stops.find((s) => s.stopId === stopId);
  const to = from ? r83!.stops.find((s) => s.seq === from.seq + 5) : undefined;
  if (to) {
    const rec = recommend({
      segment: {
        id: 'check', name: '점검', fromStopIds: [stopId], toStopIds: [to.stopId], routeFilter: [],
        schedule: null, maxWaitMin: 30, walkMin: { [stopId]: 0 },
      },
      arrivals: a.arrivals, routes, profile: null, now: new Date(),
    });
    console.log(`[추천] core=${usingCoreRecommend} → ${to.name}: ${rec.reason} (후보 ${rec.candidates.length})`);
  }
}

main().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
