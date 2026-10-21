// 부산 시내버스 노선 + 경유 정류장 수집 → data/static/routes.json (Route[])
// 실행: node scripts/fetch-routes.mjs [--include-village] [--refresh]
//
// 1) busInfo 를 lineno 없이 호출하면 전체 노선(마을버스 포함 약 290개)이 한 번에 온다.
//    (lineno 로 조회하면 부분일치라 83 → 183, 583 … 도 섞여 오므로 쓰지 않는다)
// 2) 시내버스만 남긴다: bustype 이 '마을버스' 인 노선 제외 (--include-village 로 포함 가능)
// 3) 노선별 busInfoByRouteId(lineid) 로 정류장 순서(bstopidx) 수집. 응답은 scripts/.cache/route/ 에 저장해
//    재실행 시 재호출하지 않는다 (--refresh 로 다시 받음).
// 4) stops.json 이 있으면 Stop.towards 를 채워 다시 저장한다.
import fs from 'node:fs';
import path from 'node:path';
import { callBims, items, tag, writeJson, readJson, STATIC_DIR, CACHE_DIR, usageToday } from './lib/bims.mjs';
import { fillTowards } from './lib/towards.mjs';

const args = new Set(process.argv.slice(2));
const includeVillage = args.has('--include-village');
const refresh = args.has('--refresh');
const routeCache = path.join(CACHE_DIR, 'route');
fs.mkdirSync(routeCache, { recursive: true });

/** "5-6" → 5.5, "12" → 12, "-"/빈값 → null */
function parseHeadway(v) {
  if (v == null) return null;
  const nums = String(v).match(/\d+(\.\d+)?/g)?.map(Number).filter((n) => n > 0);
  if (!nums?.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

const infoXml = await callBims('busInfo');
const allLines = items(infoXml);
const lines = allLines.filter((l) => l.lineid && (includeVillage || l.bustype !== '마을버스'));
console.log(`busInfo 전체 ${allLines.length}개 노선 중 대상 ${lines.length}개 (마을버스 ${includeVillage ? '포함' : '제외'})`);

const notes = []; // 리포트용 이상치
const routes = [];
let called = 0;
for (const [i, l] of lines.entries()) {
  const cacheFile = path.join(routeCache, `${l.lineid}.xml`);
  let xml;
  if (!refresh && fs.existsSync(cacheFile)) {
    xml = fs.readFileSync(cacheFile, 'utf8');
  } else {
    xml = await callBims('busInfoByRouteId', { lineid: l.lineid });
    called++;
    const total = Number(tag(xml, 'totalCount'));
    if (Number.isFinite(total) && total > items(xml).length) {
      notes.push(`${l.buslinenum}: totalCount ${total} > 응답 ${items(xml).length} (페이징 필요할 수 있음)`);
    }
    fs.writeFileSync(cacheFile, xml);
  }
  process.stdout.write(`  ${i + 1}/${lines.length} ${l.buslinenum}        \r`);

  const seen = new Set();
  const stops = [];
  for (const it of items(xml)) {
    const seq = Number(it.bstopidx);
    if (!it.nodeid || !Number.isInteger(seq) || seen.has(seq)) continue;
    seen.add(seq);
    stops.push({ stopId: it.nodeid, seq, name: it.bstopnm ?? '' });
  }
  stops.sort((a, b) => a.seq - b.seq);
  if (!stops.length) notes.push(`${l.buslinenum} (${l.lineid}): 경유 정류장 0개`);
  if (stops.length && (stops[0].seq !== 1 || stops.at(-1).seq !== stops.length)) {
    notes.push(`${l.buslinenum}: bstopidx 가 1..${stops.length} 로 연속되지 않음 (${stops[0].seq}..${stops.at(-1).seq})`);
  }

  const generic = parseHeadway(l.headway);
  const pick = (v, ...fallback) => {
    for (const x of [v, generic, ...fallback]) {
      const n = parseHeadway(x);
      if (n != null) return n;
    }
    return 0;
  };
  const headway = {
    peak: pick(l.headwaypeak, l.headwaynorm),
    normal: pick(l.headwaynorm, l.headwaypeak),
    holiday: pick(l.headwayholi, l.headwaynorm),
  };
  const raw = [l.headwaypeak, l.headwaynorm, l.headwayholi];
  if (raw.some((v) => parseHeadway(v) == null)) {
    notes.push(
      `${l.buslinenum}: 배차간격 원본 peak=${l.headwaypeak ?? '없음'} norm=${l.headwaynorm ?? '없음'} holi=${l.headwayholi ?? '없음'} headway=${l.headway ?? '없음'} → ${JSON.stringify(headway)}`,
    );
  }
  if (!l.firsttime || !l.endtime) notes.push(`${l.buslinenum}: 첫차/막차 없음`);

  routes.push({
    id: l.lineid,
    no: l.buslinenum ?? '',
    type: l.bustype ?? '',
    stops,
    headway,
    firstTime: l.firsttime ?? '',
    lastTime: l.endtime ?? '',
  });
}
console.log();

routes.sort((a, b) => a.id.localeCompare(b.id));
writeJson(path.join(STATIC_DIR, 'routes.json'), routes);
console.log(`저장: data/static/routes.json (${routes.length}개 노선, 이번에 호출 ${called}건)`);

const stopsFile = path.join(STATIC_DIR, 'stops.json');
if (fs.existsSync(stopsFile)) {
  const stops = readJson(stopsFile);
  const r = fillTowards(stops, routes);
  writeJson(stopsFile, r.stops);
  const known = new Set(stops.map((s) => s.id));
  const missing = new Set(routes.flatMap((x) => x.stops.map((s) => s.stopId)).filter((id) => !known.has(id)));
  console.log(`stops.json towards 채움: ${r.filled}/${stops.length}`);
  if (missing.size) notes.push(`routes 에는 있으나 stops.json 에 없는 정류소ID ${missing.size}개: ${[...missing].slice(0, 20).join(', ')}`);
} else {
  console.log('stops.json 이 없어 towards 는 건너뜀 (fetch-stops 실행 후 다시 실행하면 채워짐)');
}

fs.writeFileSync(path.join(CACHE_DIR, 'fetch-routes-notes.txt'), notes.join('\n') + '\n');
if (notes.length) console.log(`참고 사항 ${notes.length}건 → scripts/.cache/fetch-routes-notes.txt\n  ` + notes.slice(0, 15).join('\n  '));
console.log('오늘 호출 수:', usageToday());
