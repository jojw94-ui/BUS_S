# 공용 타입 변경 제안 (app 담당, 2026-10-21)

`packages/core/src/types.ts` 는 수정하지 않았다. 아래는 제안만 남긴다.

1. **`Arrival.busType?: BusType` 추가**
   - `stopArrByBstopid` 응답에 `bustype`(일반버스·급행버스·마을버스 등)이 행마다 온다.
   - 지금은 앱이 `StopArrivals.busTypes`(routeId → bustype)로 따로 들고 다닌다. 범위(마을버스 제외 등) 판단을 core 에서 하려면 Arrival 에 있는 편이 낫다.
2. **`Stop.arsNo` 가 빈 문자열일 수 있음을 주석에 명시**
   - 실측: 마을버스 전용 정류장 9곳은 `<arsno> </arsno>`(공백)로 온다 → 앱은 `''` 로 저장.
