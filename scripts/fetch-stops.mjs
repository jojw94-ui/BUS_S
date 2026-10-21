// 부산 BIMS busStopList 전체 정류장 수집 → data/static/stops.json (Stop[])
// 실행: node scripts/fetch-stops.mjs
// routes.json 이 이미 있으면 Stop.towards 도 함께 채운다.
import fs from 'node:fs';
import path from 'node:path';
import { callBims, items, tag, writeJson, readJson, STATIC_DIR, usageToday } from './lib/bims.mjs';
import { fillTowards } from './lib/towards.mjs';

const PAGE_SIZE = 1000;

const first = await callBims('busStopList', { pageNo: '1', numOfRows: String(PAGE_SIZE) });
const total = Number(tag(first, 'totalCount'));
const pages = Math.ceil(total / PAGE_SIZE);
console.log(`정류장 총 ${total}개, ${pages}페이지`);

const raw = items(first);
for (let p = 2; p <= pages; p++) {
  const xml = await callBims('busStopList', { pageNo: String(p), numOfRows: String(PAGE_SIZE) });
  raw.push(...items(xml));
  process.stdout.write(`  ${p}/${pages}\r`);
}

const byId = new Map();
let dup = 0;
let badCoord = 0;
for (const it of raw) {
  if (!it.bstopid) continue;
  if (byId.has(it.bstopid)) {
    dup++;
    continue;
  }
  const lat = Number(it.gpsy);
  const lng = Number(it.gpsx);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) badCoord++;
  byId.set(it.bstopid, { id: it.bstopid, arsNo: it.arsno ?? '', name: it.bstopnm ?? '', lat, lng });
}
let stops = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));

if (stops.length !== total) console.warn(`경고: totalCount ${total} 와 수집 수 ${stops.length} 가 다름 (중복 ${dup})`);
if (badCoord) console.warn(`경고: 좌표가 비정상인 정류장 ${badCoord}개`);

const routesFile = path.join(STATIC_DIR, 'routes.json');
if (fs.existsSync(routesFile)) {
  const r = fillTowards(stops, readJson(routesFile));
  stops = r.stops;
  console.log(`towards 채움: ${r.filled}/${stops.length}`);
}

writeJson(path.join(STATIC_DIR, 'stops.json'), stops);
console.log(`저장: data/static/stops.json (${stops.length}개, 중복 제거 ${dup})`);
console.log('오늘 호출 수:', usageToday());
