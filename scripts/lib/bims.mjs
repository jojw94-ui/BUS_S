// 부산 BIMS Open API 호출 공용 모듈 (scripts 전용, 외부 의존성 없음)
// - API 키: 환경변수 BUSAN_BIMS_API_KEY → 없으면 루트 .env → BIMS_ENV_FILE 경로의 .env
// - 호출 사이 지연(기본 300ms), 기능별 일일 호출 수를 scripts/.cache/usage-YYYY-MM-DD.json 에 기록
// - 기능별 일일 한도 10,000건 → 기본 상한 9,000건에서 멈춤 (BIMS_DAILY_CAP 으로 조정)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CACHE_DIR = path.join(ROOT, 'scripts', '.cache');
export const STATIC_DIR = path.join(ROOT, 'data', 'static');

const ENDPOINT = 'https://apis.data.go.kr/6260000/BusanBIMS';
const DELAY_MS = Number(process.env.BIMS_DELAY_MS ?? 300);
const DAILY_CAP = Number(process.env.BIMS_DAILY_CAP ?? 9000);

function readEnvFile(file) {
  if (!file || !fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*BUSAN_BIMS_API_KEY\s*=\s*(.*)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return null;
}

export function loadApiKey() {
  const key =
    process.env.BUSAN_BIMS_API_KEY ||
    readEnvFile(path.join(ROOT, '.env')) ||
    readEnvFile(process.env.BIMS_ENV_FILE);
  if (!key) {
    throw new Error(
      'BUSAN_BIMS_API_KEY 가 없습니다. 환경변수로 넘기거나 루트 .env 에 넣거나 BIMS_ENV_FILE 로 .env 경로를 지정하세요.',
    );
  }
  return key;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function usageFile() {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return path.join(CACHE_DIR, `usage-${ymd}.json`);
}

function bumpUsage(fn) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const f = usageFile();
  const u = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  if ((u[fn] ?? 0) >= DAILY_CAP) {
    throw new Error(`${fn} 오늘 호출 ${u[fn]}건 — 상한(${DAILY_CAP}) 도달. 내일 다시 실행하세요.`);
  }
  u[fn] = (u[fn] ?? 0) + 1;
  fs.writeFileSync(f, JSON.stringify(u, null, 2));
  return u[fn];
}

export function usageToday() {
  const f = usageFile();
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
}

let lastCall = 0;

/** BIMS 기능 호출 → XML 문자열. resultCode 가 00 이 아니면 예외. */
export async function callBims(fn, params = {}, { retries = 3 } = {}) {
  const key = loadApiKey();
  const qs = new URLSearchParams({ serviceKey: key, ...params });
  const url = `${ENDPOINT}/${fn}?${qs}`;
  for (let attempt = 1; ; attempt++) {
    const wait = lastCall + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    bumpUsage(fn);
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const code = tag(text, 'resultCode');
      if (code !== '00') throw new Error(`resultCode=${code} ${tag(text, 'resultMsg') ?? text.slice(0, 200)}`);
      return text;
    } catch (e) {
      if (attempt >= retries) throw new Error(`${fn} ${JSON.stringify(params)} 실패: ${e.message}`);
      await sleep(1000 * attempt);
    }
  }
}

/** 첫 번째 <name>값</name> */
export function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? decodeEntities(m[1].trim()) : null;
}

/** <item> 들을 {필드: 문자열} 배열로 */
export function items(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) =>
    Object.fromEntries(
      [...m[1].matchAll(/<(\w+)>([^<]*)<\/\1>/g)].map((f) => [f[1], decodeEntities(f[2].trim())]),
    ),
  );
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 배열은 원소 1개당 한 줄로 써서 diff 를 읽기 쉽게 한다 */
export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = Array.isArray(data)
    ? '[\n' + data.map((d) => JSON.stringify(d)).join(',\n') + '\n]'
    : JSON.stringify(data, null, 2);
  fs.writeFileSync(file, body + '\n');
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
