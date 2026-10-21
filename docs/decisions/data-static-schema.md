# 제안: 정적 데이터 관련 types.ts 보완 (data 담당, 2026-10-21)

상태: **제안**. `types.ts`는 수정하지 않았다. 지금 생성된 JSON은 현행 계약을 그대로 따른다.

## 1. CongestionProfile 값의 의미를 명시
- 지금 값은 "30분 슬롯 동안 그 정류장을 출발한 승객 흐름의 합(승차 − 보정 하차의 누적)"이다. 버스 1대의 재차인원이 아니다.
- 배차가 촘촘한 노선(81번 첨두 3분)은 값이 크게 나와, 같은 기준(`baselineThresholds`)으로 비교하면 불리하다.
- 선택지
  - A (권장): 파일은 그대로 두고, core에서 `baseline × headway(분) / slotMinutes`로 대당 추정치로 바꿔 쓴다. `types.ts`에는 주석만 보강한다.
  - B: 스크립트에서 `routes.json`의 배차간격으로 나눈 대당 값을 저장한다. 시간대별 배차(첨두/평시)를 어느 슬롯에 적용할지 정해야 한다.

## 2. `Route.headway` 결측 허용
- 3008(심야)는 busInfo에 배차·첫차·막차가 모두 없다. 1004(심야)는 시간대별 값이 `-`이고 `headway`(20)만 있다.
- 지금은 결측을 0, 시각은 `""`로 넣었다. core가 gapRatio를 계산할 때 0으로 나누지 않도록 막아야 한다.
- 제안: `headway: { peak: number | null; normal: number | null; holiday: number | null }`, `firstTime/lastTime: string | null`

## 3. `Stop.arsNo` 빈 값
- busStopList 원본에서 정류장 8,800개 중 4,619개의 `arsno`가 비어 있다. 지금은 `""`로 넣었다.
- 제안: 주석에 "ARS번호 없는 정류장은 빈 문자열"을 명시하거나 `arsNo?: string`으로 바꾼다.
