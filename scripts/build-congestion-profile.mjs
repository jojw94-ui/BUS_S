// 승하차 통계 → 평소 재차인원 프로필 → data/static/congestion-profile.json (CongestionProfile)
// 실행: node scripts/build-congestion-profile.mjs [--min-match 0.5]
//
// 입력: data/raw/busan_boarding_20230731.csv (CP949, 노선별·정류장순서별 30분 단위 승차/하차, 04:00 시작 48슬롯)
//       data/static/routes.json (fetch-routes 결과)
// 계산:
//   1) CSV 노선번호 → BIMS 노선(Route.no) 대응 (정확히 일치 → 괄호 접미사 제거 → 괄호만 제거 순)
//   2) CSV 정류장 목록과 BIMS 정류장 목록을 이름 유사도로 "순서를 지키며" 정렬(가중 LCS) → CSV 순서 ↔ bstopidx
//   3) 하차 태그는 승차의 약 43%만 기록됨 → 노선 전체 하차 합 = 승차 합이 되도록 하차에 보정계수 곱함
//   4) 시간대(slot)별로 CSV 정류장 순서대로 load = max(0, load + 승차 − 하차×보정계수) 누적
//      → "그 정류장 출발 시점 재차인원" 추정치
//   5) 매칭된 정류장은 그 값, 처음·마지막 매칭 사이의 미매칭 BIMS 정류장은 직전 매칭 정류장 값을 이어 씀.
//      매칭 범위 밖은 비워 둔다. BIMS 정류장 매칭률이 --min-match 미만인 노선은 프로필에서 제외.
// 한계: 버스 1대가 한 슬롯(30분) 안에 노선을 지나간다고 보는 단순 누적. 2023-07-31(월) 하루치.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, STATIC_DIR, readJson } from './lib/bims.mjs';

const argv = process.argv.slice(2);
const minMatchIdx = argv.indexOf('--min-match');
const MIN_MATCH = minMatchIdx >= 0 ? Number(argv[minMatchIdx + 1]) : 0.5;
const SIM_THRESHOLD = 0.7;
const SLOTS = 48;
const CSV_FILE = path.join(ROOT, 'data', 'raw', 'busan_boarding_20230731.csv');

// ---------- CSV 읽기 ----------
const text = new TextDecoder('euc-kr').decode(fs.readFileSync(CSV_FILE));
const lines = text.split(/\r?\n/).filter((l) => l.trim());
const header = lines[0].split(',');
if (header.length !== 8 + SLOTS * 2) throw new Error(`CSV 컬럼 수 ${header.length}, 예상 ${8 + SLOTS * 2}`);
// 슬롯 i: 승차 = 8+2i, 하차 = 9+2i. 실제 헤더는 i=43(01:30) 하차 컬럼명이 '오전1시30분_승차합계'로 오타 → 위치로 읽는다.
for (let i = 0; i < SLOTS; i++) {
  const b = header[8 + 2 * i];
  const a = header[9 + 2 * i];
  const sameTime = a.split('_')[0] === b.split('_')[0];
  if (!b.includes('승차') || !sameTime || !(a.includes('하차') || a === '오전1시30분_승차합계')) {
    throw new Error(`CSV 헤더 예상과 다름: slot ${i} "${b}" / "${a}"`);
  }
}
if (!header[8].startsWith('오전4시00분')) throw new Error(`첫 슬롯이 04:00 이 아님: ${header[8]}`);

/** @type {Map<string, {seq:number, code:string, name:string, board:number[], alight:number[]}[]>} */
const csvRoutes = new Map();
for (const line of lines.slice(1)) {
  const c = line.split(',');
  if (c.length !== header.length) throw new Error(`컬럼 수 불일치: ${line.slice(0, 80)}`);
  const row = {
    seq: Number(c[1]),
    code: c[2],
    name: c[3].trim(),
    board: Array.from({ length: SLOTS }, (_, i) => Number(c[8 + 2 * i]) || 0),
    alight: Array.from({ length: SLOTS }, (_, i) => Number(c[9 + 2 * i]) || 0),
  };
  if (!csvRoutes.has(c[0])) csvRoutes.set(c[0], []);
  csvRoutes.get(c[0]).push(row);
}
for (const rows of csvRoutes.values()) rows.sort((a, b) => a.seq - b.seq);

// ---------- 노선 대응 ----------
/** @type {import('../packages/core/src/types').Route[]} */
const routes = readJson(path.join(STATIC_DIR, 'routes.json'));
const routeByNo = new Map(routes.map((r) => [r.no, r]));
const SUFFIX = /\((급행|통합|공항|산성|용원)\)$/;

function mapRouteNo(csvNo, claimed) {
  const cands = [csvNo, csvNo.replace(SUFFIX, ''), csvNo.replace(/[()]/g, '')];
  for (const c of cands) {
    const r = routeByNo.get(c);
    if (r && !claimed.has(r.no)) return r;
  }
  return null;
}

// ---------- 이름 유사도 ----------
const norm = (s) =>
  s
    .normalize('NFC')
    .replace(/㈜/g, '(주)')
    .replace(/APT/gi, '아파트')
    .replace(/[\s.,·()\[\]'"\-]/g, '');
const parts = (s) => s.split(/[.,·]/).map(norm).filter((p) => p.length >= 2);
function bigrams(s) {
  const out = [];
  for (let i = 0; i + 1 < s.length; i++) out.push(s.slice(i, i + 2));
  return out;
}
function dice(a, b) {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const pool = [...B];
  let hit = 0;
  for (const g of A) {
    const k = pool.indexOf(g);
    if (k >= 0) {
      hit++;
      pool.splice(k, 1);
    }
  }
  return (2 * hit) / (A.length + B.length);
}
export function nameSim(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const short = na.length <= nb.length ? na : nb;
  const long = short === na ? nb : na;
  if (short.length >= 2 && long.includes(short)) return 0.85;
  const pa = parts(a);
  const pb = parts(b);
  if (pa.some((p) => pb.includes(p))) return 0.8;
  return dice(na, nb);
}

/** 순서를 지키는 가중 LCS 정렬 → [[csvIdx, bimsIdx], ...] */
function align(csvNames, bimsNames) {
  const n = csvNames.length;
  const m = bimsNames.length;
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const sim = Array.from({ length: n }, (_, i) => bimsNames.map((b) => nameSim(csvNames[i], b)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best = Math.max(dp[i - 1][j], dp[i][j - 1]);
      const s = sim[i - 1][j - 1];
      if (s >= SIM_THRESHOLD) best = Math.max(best, dp[i - 1][j - 1] + s);
      dp[i][j] = best;
    }
  }
  const pairs = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const s = sim[i - 1][j - 1];
    if (s >= SIM_THRESHOLD && Math.abs(dp[i][j] - (dp[i - 1][j - 1] + s)) < 1e-9) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return pairs.reverse();
}

// ---------- 계산 ----------
const round1 = (x) => Math.round(x * 10) / 10;
const profileRoutes = {};
const report = [];
const claimed = new Set();
// 정확히 일치하는 노선번호를 먼저 처리해 접미사 제거 매칭이 정확 일치를 가로채지 않게 한다
const csvOrder = [...csvRoutes.keys()].sort((a, b) => Number(routeByNo.has(b)) - Number(routeByNo.has(a)) || a.localeCompare(b, 'ko', { numeric: true }));

for (const csvNo of csvOrder) {
  const rows = csvRoutes.get(csvNo);
  const sumB = rows.reduce((s, r) => s + r.board.reduce((a, b) => a + b, 0), 0);
  const sumA = rows.reduce((s, r) => s + r.alight.reduce((a, b) => a + b, 0), 0);
  const factor = sumA > 0 ? sumB / sumA : 1;
  const entry = { csvNo, bimsNo: null, csvStops: rows.length, bimsStops: 0, matched: 0, sumB, sumA, factor, included: false, note: '' };
  report.push(entry);

  const route = mapRouteNo(csvNo, claimed);
  if (!route) {
    entry.note = '현재 BIMS에 같은 노선번호 없음';
    continue;
  }
  claimed.add(route.no);
  entry.bimsNo = route.no;
  entry.bimsStops = route.stops.length;
  if (sumA === 0) {
    // 하차 기록이 없으면 누적값이 종점까지 계속 늘어나 재차인원으로 쓸 수 없다
    entry.note = '하차 기록 0 → 보정 불가, 제외';
  } else if (factor > 4) {
    entry.note = `하차 기록률 ${((1 / factor) * 100).toFixed(0)}% — 보정계수가 커서 신뢰도 낮음`;
  }

  // slot별 누적 재차인원 (CSV 순서)
  const loads = [];
  const cur = new Array(SLOTS).fill(0);
  for (const r of rows) {
    for (let t = 0; t < SLOTS; t++) cur[t] = Math.max(0, cur[t] + r.board[t] - r.alight[t] * factor);
    loads.push(cur.map(round1));
  }

  const pairs = align(rows.map((r) => r.name), route.stops.map((s) => s.name));
  entry.matched = pairs.length;
  entry.pairs = pairs;
  const coverage = pairs.length / route.stops.length;
  if (sumA === 0) continue;
  if (coverage < MIN_MATCH) {
    entry.note = (entry.note ? entry.note + '; ' : '') + `BIMS 매칭률 ${(coverage * 100).toFixed(0)}% < ${MIN_MATCH * 100}% → 제외`;
    continue;
  }

  const byBimsIdx = new Map(pairs.map(([ci, bi]) => [bi, ci]));
  const out = {};
  let last = null;
  let filled = 0;
  const firstB = pairs[0][1];
  const lastB = pairs.at(-1)[1];
  for (let bi = firstB; bi <= lastB; bi++) {
    if (byBimsIdx.has(bi)) last = loads[byBimsIdx.get(bi)];
    else filled++;
    out[String(route.stops[bi].seq)] = last;
  }
  entry.filled = filled;
  entry.included = true;
  profileRoutes[route.no] = out;
}

// ---------- 저장 ----------
const profile = {
  source:
    '부산광역시_버스노선별 승하차 정보 2023-07-31(월) (data.go.kr 15123610) — 하차를 노선별 승차 합계에 맞춰 비례 보정 후 정류장 순서대로 누적한 정류장 출발 시점 재차인원 추정치',
  slotMinutes: 30,
  firstSlot: '04:00',
  routes: profileRoutes,
};
// 정류장 1개당 한 줄 (파일 크기와 diff 가독성)
const body =
  '{\n' +
  `  "source": ${JSON.stringify(profile.source)},\n` +
  `  "slotMinutes": ${profile.slotMinutes},\n` +
  `  "firstSlot": ${JSON.stringify(profile.firstSlot)},\n` +
  '  "routes": {\n' +
  Object.entries(profileRoutes)
    .map(
      ([no, stops]) =>
        `    ${JSON.stringify(no)}: {\n` +
        Object.entries(stops)
          .map(([seq, arr]) => `      ${JSON.stringify(seq)}: ${JSON.stringify(arr)}`)
          .join(',\n') +
        '\n    }',
    )
    .join(',\n') +
  '\n  }\n}\n';
fs.writeFileSync(path.join(STATIC_DIR, 'congestion-profile.json'), body);

// ---------- 매칭 리포트 ----------
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '-');
const inc = report.filter((r) => r.included);
const mapped = report.filter((r) => r.bimsNo);
const totMatched = mapped.reduce((s, r) => s + r.matched, 0);
const totBims = mapped.reduce((s, r) => s + r.bimsStops, 0);
const totCsv = mapped.reduce((s, r) => s + r.csvStops, 0);
const noCsv = routes.filter((r) => !claimed.has(r.no)).map((r) => r.no);

const md = [];
md.push('# 혼잡도 프로필 매칭 리포트');
md.push('');
md.push(`- 생성: \`node scripts/build-congestion-profile.mjs --min-match ${MIN_MATCH}\` (${new Date().toISOString().slice(0, 10)})`);
md.push('- 입력: `data/raw/busan_boarding_20230731.csv` (2023-07-31) × `data/static/routes.json` (BIMS 현재 노선)');
md.push(`- 정류장 이름 유사도 기준 ${SIM_THRESHOLD} (정규화 후 일치 1.0 / 포함 0.85 / '.'로 나눈 부분 일치 0.8 / 그 외 bigram Dice), 순서 보존 정렬`);
md.push(`- CSV 노선 ${report.length}개 → BIMS 노선 대응 ${mapped.length}개 → 프로필 포함 ${inc.length}개 (BIMS 정류장 매칭률 ${MIN_MATCH * 100}% 이상)`);
md.push(`- 대응된 노선 전체: CSV 정류장 ${totCsv}개 중 ${totMatched}개 매칭 (${pct(totMatched, totCsv)}), BIMS 정류장 ${totBims}개 중 ${pct(totMatched, totBims)}`);
md.push(`- 현재 BIMS 시내버스 ${routes.length}개 중 승하차 데이터가 있는 노선 ${claimed.size}개, 프로필 포함 ${inc.length}개`);
md.push('');
md.push('## 노선별');
md.push('');
md.push('| CSV 노선 | BIMS 노선 | CSV 정류장 | BIMS 정류장 | 매칭 | CSV 기준 | BIMS 기준 | 메움 | 하차 보정계수 | 포함 | 비고 |');
md.push('|---|---|---:|---:|---:|---:|---:|---:|---:|:-:|---|');
for (const r of [...report].sort((a, b) => a.csvNo.localeCompare(b.csvNo, 'ko', { numeric: true }))) {
  md.push(
    `| ${r.csvNo} | ${r.bimsNo ?? '-'} | ${r.csvStops} | ${r.bimsStops || '-'} | ${r.matched} | ${pct(r.matched, r.csvStops)} | ${pct(r.matched, r.bimsStops)} | ${r.filled ?? '-'} | ${r.factor.toFixed(2)} | ${r.included ? 'O' : 'X'} | ${r.note} |`,
  );
}
md.push('');
md.push('## 승하차 데이터가 없는 현재 BIMS 노선');
md.push('');
md.push(noCsv.join(', ') || '없음');
md.push('');
md.push('- "메움": 처음·마지막 매칭 정류장 사이에서 매칭되지 않은 BIMS 정류장 수 — 직전 매칭 정류장의 값을 이어 씀');
md.push('- "하차 보정계수": 노선 승차 합 ÷ 하차 합. 하차 기록에 이 값을 곱해 누적');
fs.writeFileSync(path.join(STATIC_DIR, 'profile-match-report.md'), md.join('\n') + '\n');

console.log(`CSV 노선 ${report.length}개, BIMS 대응 ${mapped.length}개, 프로필 포함 ${inc.length}개`);
console.log(`정류장 매칭: CSV ${pct(totMatched, totCsv)}, BIMS ${pct(totMatched, totBims)}`);
console.log('저장: data/static/congestion-profile.json, data/static/profile-match-report.md');
