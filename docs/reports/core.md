# 작업 보고: core (추천 로직) — 2026-10-21

브랜치: `ai_wave/bus-core` · 범위: `packages/core/` (+ 이 보고서)

## 한 일

| 파일 | 내용 |
|---|---|
| `packages/core/package.json` | devDependencies(vitest 3, typescript 5, @types/node 22), 스크립트 `test`(vitest run)·`typecheck`(tsc --noEmit) |
| `packages/core/tsconfig.json`, `vitest.config.ts` | core 안에서만 쓰는 TS·Vitest 설정 |
| `src/config.ts` | `DEFAULT_RECOMMEND_CONFIG`, `resolveConfig(부분설정)` |
| `src/congestion.ts` | 혼잡도 추정 (아래 규칙) |
| `src/recommend.ts` | `recommend(input): Recommendation` |
| `src/index.ts` | 위 함수·상수 export (types.ts 는 그대로 re-export, **수정 없음**) |
| `test/` | 테스트 39개 + 테스트 전용 BIMS XML 파서·픽스처 |

### 혼잡도 (`estimateCongestion`)
- **평소 재차인원(baseline)**: `profile.routes[routeNo][탑승 정류장 seq][현재 시각 slot]`. 프로필·노선·순번이 없으면 null.
  - slot = (현재 시각 − firstSlot) ÷ slotMinutes, 24시간 기준으로 돌린다 (04:00 시작이면 03:59 → 47번 slot).
- **간격비(gapRatio)** = 실제 간격 ÷ 평소 배차 간격
  - 배차 간격: 평일 07~09시·17~19시(끝 시각 미포함) `peak`, 토·일 `holiday`, 그 외 `normal`
  - 2번째 버스: `min2 − min1`
  - 1번째 버스: 앞차는 이미 지나가서 실제 간격은 "etaMin 이상"이라는 것만 안다. 그래서 **etaMin ≥ 배차 간격일 때만** etaMin 을 간격으로 쓰고, 그보다 짧으면 null(판단 불가). — 2분 뒤 오는 차를 "간격 짧음 → 여유"로 잘못 판단하지 않기 위함.
- **결합**: 각각 경계값으로 0~3 단계를 낸 뒤
  - 둘 다 있으면 `평소 단계 + (간격비 단계 − 1)`, 0~3으로 자름 (간격 보통이면 평소 그대로, 벌어지면 +, 붙어 오면 −)
  - 하나만 있으면 그 단계, 둘 다 없으면 1(보통)

### 추천 (`recommend`)
1. 출발 정류장 도착정보 × 도착 정류장마다, `Route.stops` 에서 출발 seq < 도착 seq 인 노선만 후보 (도착정보의 `stopSeq` 를 우선 사용, `routeFilter` 는 노선 번호·노선ID 둘 다 허용). 정적 노선 정보(`routes`)에 없는 노선은 무시.
2. 버스별 제외: `etaMin > maxWaitMin` 또는 `etaMin < walkMin[출발정류장]` (같으면 탈 수 있음)
3. 정류장 조합마다 **지금 탈 수 있는 첫 버스**를 후보로 삼아 정렬: 혼잡 단계 ↑ → totalMin ↑ → etaMin ↑ → 노선번호 → 정류장ID (동률도 결과가 항상 같게)
   - 1번째 버스를 도보시간 때문에 못 타면 2번째 버스가 후보가 된다 (`busIndex: 1`).
4. `best` = 1위. 같은 노선·같은 정류장 조합의 그 다음 버스가 (2번 제외 조건을 통과하고) 단계가 더 낮고 추가 대기 ≤ `nextBusExtraWaitMin` 이면 `waitForNext`.
5. `candidates` 는 정류장 조합별 첫 버스 목록(추천 순). 2번째 버스는 `waitForNext` 로만 나온다 — 2번째 버스까지 같이 정렬하면 "한산한 2번째 차"가 추가 대기 제한 없이 1위가 되어 3순위 규칙이 무의미해지기 때문.
6. `reason` 예시
   - `83번 추정 보통 · 5분 후 도착 · 4분 소요`
   - `83번 추정 혼잡 · 3분 후 도착 · 4분 소요 · 모든 후보가 혼잡 예상` (1위가 혼잡 이상 = 전부 혼잡)
   - `83번 다음 차 추천 · 앞차 추정 매우혼잡, 1분 더 기다리면 추정 여유 · 10분 후 도착 · 4분 소요`
   - 후보 없음: `두 정류장을 같은 방향으로 지나는 노선이 없습니다. …` / `지금 도착 예정인 버스가 없습니다.` / `최대 대기 10분 안에 걸어가서 탈 수 있는 버스가 없습니다.`

## 검증

```
cd packages/core
npx vitest run   → Test Files 3 passed, Tests 39 passed
npx tsc --noEmit → 오류 없음
```

- 요구된 케이스: 동률(소요시간 동률·완전 동률·입력 순서 무관), 후보 없음(최대 대기 초과·도착 버스 없음·빈 응답·노선 필터·정적 노선 없음), 전부 혼잡, 다음 차 추천(성공·허용 초과·설정으로 허용 확대·최대 대기 초과·더 낫지 않음), 도보시간 제외(정류장별 적용·경계값), 방향 반대 정류장 제외(서면한전 22번째/31번째 실제 ID), 프로필 없음(간격비만·둘 다 없음·노선 없음·결합)
- 픽스처는 `stopArrByBstopid` 응답과 같은 태그의 XML 을 만들어 테스트 전용 파서(`test/helpers/bims-xml.ts`)로 `Arrival` 로 바꿔 쓴다.
- `test/samples.test.ts`: `data/samples/` 의 실제 응답(83번 노선 정류장·배차, 서면역.롯데호텔백화점 도착정보, 서면 일대 전체 도착정보)으로 서면역.롯데호텔백화점 → 부전시장 추천 → 83번 4135호, 5분 후, 2정거장.

## 미해결 질문 (확인 필요)

1. **기준값 — 전부 임시값입니다. 확인해 주세요.** (`src/config.ts`)
   | 항목 | 임시값 | 근거 |
   |---|---|---|
   | `nextBusExtraWaitMin` | 5분 | 제안서 3장 |
   | `minPerStop` | 2분 | 시내버스 정류장 간 1.5~2분 가정 |
   | `gapRatioThresholds` | [0.7, 1.3, 1.8] | `congestion.md` 대체안 A 초기값 |
   | `baselineThresholds` | [25, 45, 65]명 | 좌석 약 25석, 입석 포함 정원 약 65명 가정. **프로필(하차 보정 방식)이 나오면 실제 분포를 보고 다시 정해야 함** |
2. **간격비·평소 단계 결합 규칙**(위 "결합")과 **1번째 버스 간격비를 etaMin ≥ 배차일 때만 쓰는 규칙**이 괜찮은지.
3. **프로필 slot 기준 시각**: 지시대로 "현재 시각"을 쓴다. 버스가 실제 도착하는 시각(now + etaMin)이 더 정확할 수 있음 — 30분 경계 근처에서만 차이.
4. **공휴일**: 달력 데이터가 없어 평일 공휴일은 평일로 계산한다. 필요하면 `RecommendInput` 에 공휴일 목록을 넣는 types.ts 변경을 제안할 예정.
5. **소요시간**: 정류장 수 × `minPerStop` 으로만 추정. `busInfoByRouteId` 의 `avgym` 이 정류장 간 평균 소요(초)로 보이지만 의미가 확인되지 않아 쓰지 않았다 (`docs/api-notes/` 확인 필요).
6. **다음 차 판단 범위**: `best` 노선의 다음 차만 본다. 다른 노선의 2번째 차가 더 나은 경우는 고려하지 않음.

## 참고
- 제안서 Phase 1 완료 조건 중 "샘플 데이터로 CLI 실행 시 추천 결과 출력"은 이번 지시 범위 밖이라 만들지 않았다 (`samples.test.ts` 가 같은 내용을 검증).
- `docs/progress.md` 는 공용 파일이라 수정하지 않았다. 병합 시 coordinator 가 이 보고서 요약을 추가해 주세요.
- `npm install` 시 esbuild postinstall 이 allowScripts 미승인 경고를 냈지만 vitest 실행에는 문제 없었다.
- 루트 `package-lock.json` 은 생성됐으나 커밋하지 않았다.
