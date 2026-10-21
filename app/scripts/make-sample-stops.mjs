// data/static/stops.json 이 아직 없어서, data/samples 의 실제 응답에서 임시 정류장 목록을 만든다.
// 출력: app/src/data/stops.sample.json (Stop[] 형식)
// 실행: node app/scripts/make-sample-stops.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

const here = dirname(fileURLToPath(import.meta.url));
const samples = resolve(here, '../../data/samples');
const parser = new XMLParser({ parseTagValue: false, trimValues: true });

function items(file) {
  const xml = readFileSync(resolve(samples, file), 'utf8');
  // 여러 응답을 이어 붙인 파일도 있어 <item> 단위로 나눠 읽는다
  return [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)].map((m) => parser.parse(m[0]).item);
}

const stops = new Map();
for (const it of items('busStopList_seomyeon.xml')) {
  stops.set(it.bstopid, { id: it.bstopid, arsNo: it.arsno, name: it.bstopnm, lat: +it.gpsy, lng: +it.gpsx });
}
for (const it of items('stopArr_seomyeon_all.xml')) {
  if (!stops.has(it.bstopid)) {
    stops.set(it.bstopid, { id: it.bstopid, arsNo: it.arsno, name: it.nodenm, lat: +it.gpsy, lng: +it.gpsx });
  }
}
const list = [...stops.values()].sort((a, b) => a.arsNo.localeCompare(b.arsNo));
writeFileSync(resolve(here, '../src/data/stops.sample.json'), JSON.stringify(list, null, 1) + '\n');
console.log(`정류장 ${list.length}곳 저장`);
