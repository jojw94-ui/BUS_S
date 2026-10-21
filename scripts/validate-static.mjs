// data/static 의 세 JSON 이 packages/core/src/types.ts 계약(Stop[], Route[], CongestionProfile)과 맞는지 검사
// 실행: node scripts/validate-static.mjs   (오류가 있으면 종료 코드 1)
// types.ts 를 바꾸면 이 파일의 검사도 같이 맞춰야 한다.
import fs from 'node:fs';
import path from 'node:path';
import { STATIC_DIR, readJson } from './lib/bims.mjs';

const errors = [];
const warnings = [];
const err = (m) => errors.length < 200 && errors.push(m);
const warn = (m) => warnings.push(m);
const isStr = (v) => typeof v === 'string';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const HHMM = /^\d{2}:\d{2}$/;

function onlyKeys(obj, allowed, where) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) err(`${where}: 계약에 없는 필드 "${k}"`);
}

function load(name) {
  const f = path.join(STATIC_DIR, name);
  if (!fs.existsSync(f)) {
    err(`${name} 없음`);
    return null;
  }
  return readJson(f);
}

// ---------- stops.json : Stop[] ----------
const stops = load('stops.json');
const stopIds = new Set();
if (stops) {
  if (!Array.isArray(stops)) err('stops.json 이 배열이 아님');
  else {
    let noArs = 0;
    let outside = 0;
    for (const [i, s] of stops.entries()) {
      const w = `stops[${i}]`;
      onlyKeys(s, ['id', 'arsNo', 'name', 'lat', 'lng', 'towards'], w);
      if (!isStr(s.id) || !/^\d{9}$/.test(s.id)) err(`${w}.id 가 9자리 문자열 아님: ${s.id}`);
      if (stopIds.has(s.id)) err(`${w}.id 중복: ${s.id}`);
      stopIds.add(s.id);
      if (!isStr(s.arsNo)) err(`${w}.arsNo 문자열 아님`);
      else if (!/^\d{5}$/.test(s.arsNo)) noArs++;
      if (!isStr(s.name) || !s.name) err(`${w}.name 비어 있음`);
      if (!isNum(s.lat) || !isNum(s.lng)) err(`${w} 좌표가 숫자 아님`);
      else if (s.lat < 34.8 || s.lat > 35.6 || s.lng < 128.6 || s.lng > 129.5) outside++;
      if (s.towards !== undefined && (!isStr(s.towards) || !s.towards)) err(`${w}.towards 가 빈 값/비문자열`);
    }
    if (noArs) warn(`stops: arsNo 가 5자리가 아닌(빈 값 포함) 정류장 ${noArs}개`);
    if (outside) warn(`stops: 부산 근방 좌표 범위를 벗어난 정류장 ${outside}개`);
  }
}

// ---------- routes.json : Route[] ----------
const routes = load('routes.json');
const routeByNo = new Map();
if (routes) {
  if (!Array.isArray(routes)) err('routes.json 이 배열이 아님');
  else {
    const ids = new Set();
    let unknownStops = 0;
    for (const [i, r] of routes.entries()) {
      const w = `routes[${i}](${r.no})`;
      onlyKeys(r, ['id', 'no', 'type', 'stops', 'headway', 'firstTime', 'lastTime'], w);
      if (!isStr(r.id) || !/^\w{10}$/.test(r.id)) err(`${w}.id 가 10자리 문자열 아님: ${r.id}`);
      if (ids.has(r.id)) err(`${w}.id 중복`);
      ids.add(r.id);
      if (!isStr(r.no) || !r.no) err(`${w}.no 비어 있음`);
      if (routeByNo.has(r.no)) err(`${w}.no 중복 — 프로필 키가 모호해짐`);
      routeByNo.set(r.no, r);
      if (!isStr(r.type)) err(`${w}.type 문자열 아님`);
      if (!Array.isArray(r.stops) || !r.stops.length) err(`${w}.stops 비어 있음`);
      else {
        r.stops.forEach((s, k) => {
          onlyKeys(s, ['stopId', 'seq', 'name'], `${w}.stops[${k}]`);
          if (!isStr(s.stopId) || !/^\d{9}$/.test(s.stopId)) err(`${w}.stops[${k}].stopId 이상: ${s.stopId}`);
          if (!Number.isInteger(s.seq) || s.seq !== k + 1) err(`${w}.stops[${k}].seq 가 ${k + 1} 아님: ${s.seq}`);
          if (!isStr(s.name)) err(`${w}.stops[${k}].name 문자열 아님`);
          if (stops && !stopIds.has(s.stopId)) unknownStops++;
        });
      }
      const h = r.headway;
      if (!h || typeof h !== 'object') err(`${w}.headway 없음`);
      else {
        onlyKeys(h, ['peak', 'normal', 'holiday'], `${w}.headway`);
        for (const k of ['peak', 'normal', 'holiday']) {
          if (!isNum(h[k]) || h[k] < 0) err(`${w}.headway.${k} 숫자 아님: ${h[k]}`);
          else if (h[k] === 0) warn(`${r.no}: headway.${k} = 0 (원본 값 없음)`);
        }
      }
      for (const k of ['firstTime', 'lastTime']) {
        if (!isStr(r[k])) err(`${w}.${k} 문자열 아님`);
        else if (!HHMM.test(r[k])) warn(`${r.no}: ${k} 형식이 HH:MM 아님 ("${r[k]}")`);
      }
    }
    if (unknownStops) warn(`routes: stops.json 에 없는 정류소ID 참조 ${unknownStops}건`);
  }
}

// ---------- congestion-profile.json : CongestionProfile ----------
const profile = load('congestion-profile.json');
if (profile) {
  onlyKeys(profile, ['source', 'slotMinutes', 'firstSlot', 'routes'], 'profile');
  if (!isStr(profile.source) || !profile.source) err('profile.source 비어 있음');
  if (profile.slotMinutes !== 30) err(`profile.slotMinutes 가 30 아님: ${profile.slotMinutes}`);
  if (profile.firstSlot !== '04:00') err(`profile.firstSlot 가 "04:00" 아님: ${profile.firstSlot}`);
  const slots = (24 * 60) / profile.slotMinutes;
  if (!profile.routes || typeof profile.routes !== 'object') err('profile.routes 없음');
  else {
    for (const [no, bySeq] of Object.entries(profile.routes)) {
      const r = routeByNo.get(no);
      if (routes && !r) err(`profile: routes.json 에 없는 노선번호 "${no}"`);
      const seqs = new Set(r?.stops.map((s) => String(s.seq)));
      for (const [seq, arr] of Object.entries(bySeq)) {
        if (r && !seqs.has(seq)) err(`profile.${no}: 노선에 없는 stopSeq "${seq}"`);
        if (!Array.isArray(arr) || arr.length !== slots) err(`profile.${no}.${seq}: 길이 ${arr?.length} (예상 ${slots})`);
        else if (arr.some((v) => !isNum(v) || v < 0)) err(`profile.${no}.${seq}: 음수/비숫자 값`);
      }
    }
  }
}

console.log(`stops ${stops?.length ?? '-'}개, routes ${routes?.length ?? '-'}개, profile 노선 ${profile ? Object.keys(profile.routes).length : '-'}개`);
if (warnings.length) console.log(`경고 ${warnings.length}건:\n  ` + warnings.join('\n  '));
if (errors.length) {
  console.error(`오류 ${errors.length}건:\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log('검증 통과: 세 JSON 이 types.ts 스키마와 일치');
