# app 담당 작업 보고 (2026-10-21)

## 한 일
- **Expo SDK 58**(최신 안정, RN 0.88, React 19.3, TS 6.0) blank-typescript 템플릿으로 `app/` 생성
  - npm workspaces 패키지 `@bus-s/app`, `@bus-s/core` 를 `*` 의존성으로 연결
  - `app/metro.config.js`: 저장소 루트를 watchFolders 에, 루트·app node_modules 를 해석 경로에 추가
  - `app/.env`(gitignore 확인: `git check-ignore` 통과) / `app/.env.example` 제공. 키는 `EXPO_PUBLIC_BUSAN_BIMS_API_KEY`
  - 추가 의존성: AsyncStorage, expo-location, react-native-safe-area-context, fast-xml-parser, react-dom·react-native-web(웹 확인용), tsx(점검 스크립트용, dev)
- **`app/src/api/bims.ts`**
  - `getStopArrivals(stopId)` — `stopArrByBstopid` → `Arrival[]` (+ 정류장 정보, 노선별 bustype). 버스가 없으면 `carnoN/minN` 필드가 빠지는 실측 형태 처리
  - `searchStops(q)` — `busStopList`, 5자리 숫자면 `arsno`, 아니면 `bstopnm` 부분일치
  - `getRoute(lineid)` — `busInfoByRouteId` + `busInfo` → `Route` (routes.json 이 생기기 전 임시 공급원, 6시간 캐시)
  - 메모리 TTL 캐시: 도착정보 20초(제안서 15~30초 범위), 동시 요청 공유. 게이트웨이 인증 오류(`OpenAPI_ServiceResponse`) 형식도 처리
- **저장소** `app/src/storage/segments.ts`: `CommuteSegment[]` AsyncStorage 저장, 선택한 정류장(이름·좌표) 별도 저장, JSON 내보내기(Share)/가져오기(붙여넣기, 형식 검증 후 교체)
- **화면** (탭 3개, 별도 내비게이션 라이브러리 없음)
  - ① 추천(홈): 현재 요일·시간대 구간 자동 선택(자정 넘는 시간대 지원), 구간 칩으로 전환, 1위 크게 + reason + **'추정 혼잡도'** 배지 + 다른 후보 + 출발 정류장별 도착정보, 카카오맵 길안내 버튼. 화면이 보이고 앱이 foreground 일 때만 30초 새로고침. 맞는 구간이 없으면 GPS 근처 정류장(300m)
  - ② 구간 설정: 이름, 출발/도착 정류장 여러 개(검색·근처에서 고르고 **"OO 방면" 확인 후 선택**), 출발 정류장별 도보시간, 노선 제한, 요일·시간대, 최대 대기
  - ③ 정류장 검색: 이름/ARS 검색, 근처 정류장, 정류장 상세(방면 + 실시간 도착)
  - "OO 방면": 해당 정류장을 지나는 노선들의 **다음 정류장 이름**(정류소ID+bstopidx 로 찾음)
- **`app/src/lib/recommend.ts`**: `@bus-s/core` 에 `recommend` 가 있으면 사용, 없으면 같은 시그니처 임시 구현(출발→도착 순서로 지나는 노선만, 도보·최대대기 필터, 첫 버스 etaMin 순). 임시 사용 중이면 홈에 안내 문구 표시
- **딥링크** `kakaomap://route?sp=..&ep=..&by=PUBLICTRANSIT`, 앱이 없으면 카카오맵 웹 링크
- **근처 정류장 목록**: `data/static/stops.json` 이 아직 없어 `data/samples` 의 서면 일대 실제 응답 26곳으로 임시 목록 생성 (`app/scripts/make-sample-stops.mjs` → `app/src/data/stops.sample.json`). 교체는 `app/src/data/stops.ts` import 한 줄

## 검증 결과
- `npx tsc --noEmit` (app) 통과
- `npx expo-doctor` 20/20 통과
- `npx expo start` → 안드로이드 번들 오류 없음 (dev 서버에서 `app/index.ts` 799 모듈 번들, HTTP 200)
- `npx expo export --platform android` → 번들 생성 성공. 단 Hermes 바이트코드 단계는 이 PC 에서 `spawn UNKNOWN`(hermesc.exe 실행 실패, 환경 문제로 추정)이라 `--no-bytecode` 로 확인
- `npm run check:api -w @bus-s/app` (실제 API, 앱과 같은 코드):
  - 서면역.롯데호텔백화점(164630302) 83번 도착 8분/13분, 캐시 재사용 확인
  - '서면' 검색 26곳, 노선 정보 조회, "부산진경찰서 방면"
  - 임시 추천: 서면역 → 5정류장 뒤 부전시장 구간에서 83번 후보 2개
- **화면 확인 (Expo 웹, Chrome)**: 정류장 검색 '05190' → 서면역.롯데호텔백화점 → "부산진경찰서 방면" + 83번 실시간 도착(6분/11분, 저상)이 화면에 표시됨. 콘솔 오류 없음. BIMS API 는 CORS 허용 헤더를 돌려줘서 웹에서도 동작
- **미확인**: 실제 안드로이드 폰/에뮬레이터 실행(이 PC 에 adb·SDK 없음), GPS 근처 정류장(브라우저 위치 권한 미허용), 카카오맵 딥링크 실제 동작, AsyncStorage 내보내기/가져오기 수동 테스트

## 미해결 질문 / 메모
1. `docs/api-notes/busan-bims.md` 의 busInfo 필드 `lineno` 는 실측상 **`buslinenum`** 이다 (코드는 실측 기준). 문서 수정은 담당 밖이라 남김
2. `lowplate1/2 = 1` 을 저상버스로 해석함 (값 0/1 만 관측). 활용가이드로 확인 필요
3. 기본값: 새 구간 최대 대기 10분(제안서 값), 도보시간 0분(사용자가 입력), 시간대 기본 평일 07:00~09:00 — 확인 부탁
4. 임시 recommend 는 `minPerStop` 기본값을 정하지 않아 소요시간(분)을 0 으로 두고 정류장 수만 표시. core 완성 후 임시 구현 삭제 예정
5. `docs/progress.md` 는 병렬 작업 충돌을 피하려고 수정하지 않았다 — 병합 때 이 보고서 요약 반영 바람
6. 공용 타입 변경 제안: `docs/decisions/app-types.md`
7. `npm install` 로 생긴 루트 `package-lock.json` 은 커밋하지 않음(작업 트리에 미추적 상태로 남아 있음)
8. `EXPO_PUBLIC_` 키는 앱 번들에 포함된다 — 개인용·서버 없음 전제라 허용했지만 APK 공유 금지
