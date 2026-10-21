# 진행 기록

## 2026-10-21
- 아이디어 검토, 제안서 작성 (`docs/PROPOSAL.md`)
- 결정: 개인용 앱(서버 없음), 출퇴근 구간 설정을 핵심 기능으로, 지도 앱은 딥링크로만 연동
- 폴더 구조, CLAUDE.md, .gitignore, .env.example 생성
- 다음: Phase 0 — API 키 발급 후 부산 버스 API 응답 확인(혼잡도 필드 유무)
- Phase 0 진행: 부산 BIMS API(개발계정, 오늘 승인) 인증키를 `.env`에 저장, 6개 기능 중 5개 실호출
  - 정류소·도착정보·노선·노선별 버스위치 정상 응답, 샘플은 `data/samples/`
  - **혼잡도 필드 없음** (`seat1/2` 전부 -1) → `docs/api-notes/congestion.md`, 대체안 결정 대기
  - TAGO API는 불필요 판단 (BIMS 정류소 정보에 좌표 포함)
- 추가 데이터 조사: 부산 버스노선별 30분 단위 승하차 통계(2023-07-31 하루치) 확보 → `data/raw/`, 평소 혼잡도 추정에 사용 가능 (대체안 D)

## 2026-10-21 (오후) — 멀티에이전트 1차 작업 (Orca 워크트리 bus-core / bus-data / bus-app)
- core: 혼잡도 추정(평소 재차 × 실시간 간격비) + 추천(혼잡 단계 → 총 소요, 다음 차 추천) — `docs/reports/core.md`
- data: 정류장 8,800개, 시내버스 155개 노선, 혼잡도 프로필 132개 노선(정류장 매칭 약 89%) — `docs/reports/data.md`
- app: Expo SDK 58 앱 — 추천 홈, 구간 설정, 정류장 검색, 카카오맵 딥링크 — `docs/reports/app.md`
- 통합(coordinator)
  - 프로필 값이 "30분 합계"라서 core에서 버스 1대 기준(× 배차 / 30)으로 환산 (`perBusLoad`), types.ts 주석 보강
  - 왕복 노선이 반대편 도착 정류장을 다시 지나는 긴 경로 후보 제거
  - 앱이 정적 정류장·노선·혼잡도 프로필을 사용하도록 연결, 임시 샘플 정류장 목록 삭제
  - `npm run check:recommend -w @bus-s/app -- 서면역 부산역`: 실데이터 전체 흐름 점검 스크립트
  - 검증: core 테스트 43개 통과, core·app tsc 통과, 실시간 추천 동작 확인
- 남은 결정: 기준값(혼잡 경계, 정류장당 2분, 다음 차 5분), 마을버스 포함 여부, 실제 폰 실행

## 2026-10-21 — 출발·도착 자동 전환
- 구간 하나(예: 출근)로 반대 방향(퇴근)도 추천: `CommuteSegment.reverse` (types.ts), core `direction.ts`
- 방향 결정 순서: 직접 선택 > GPS(한쪽이 300m 이상 더 가까우면) > 반대 방향 시간대 > 오전 정방향/오후 반대
- 반대 방향 정류장은 자동으로 찾음: 탈 곳은 원래 도착지 150m 안(길 건너편 포함, 최대 4곳), 내릴 곳은 원래 출발지 350m 안
  (돌아오는 노선이 다른 길로 다니는 경우 — 예: 43번은 서면역 대신 304m 떨어진 서면한전)
- 추천 후보에서 같은 노선은 가장 좋은 출발 정류장 하나만 남김
- 앱: 홈에 방향 표시 + "⇄ 방향 바꾸기", 구간 설정에 반대 방향 시간대·도보시간
- 검증: core 테스트 54개, 웹에서 시간대·GPS(부산역 좌표)·수동 전환 확인

## 2026-10-21 — API 키 입력 (B안), APK 빌드
- 앱 [구간 설정] 탭 아래 "API 키": 각자 공공데이터포털 키를 넣으면 그 키로 호출 (없으면 앱에 들어 있는 키)
  - Encoding/Decoding 키 모두 허용, 저장 전 실제 API 로 확인, 틀린 키는 포털 사유("등록되지 않은 서비스키") 표시
- APK: `powershell -ExecutionPolicy Bypass -File app\scripts\apk\build-apk.ps1` → `dist\BUS_S-<버전>-arm64.apk`
  - `-NoBuiltinKey`: 내 키를 넣지 않은 APK (다른 사람용), `-Clean`: 네이티브 프로젝트 재생성
  - 툴체인: %LOCALAPPDATA%\bus-s-toolchain (JDK 17, Android SDK, 관리자 권한 불필요)
  - 이 PC는 Windows 스마트 앱 컨트롤이 hermesc.exe 를 막아서 바이트코드 변환 없이 JS 그대로 포함 (hermesc-passthrough)

## 2026-10-21 — GitHub 공개, 전시관 등록 준비
- 저장소 공개: https://github.com/jojw94-ui/BUS_S (`.env`·`app/android` 빌드 산출물은 제외, 커밋 기록에 API 키 없음 확인)
- 웹 빌드 확인: `npx expo export --platform web` → 브라우저에서 정류장 검색이 실제 BIMS 데이터로 동작
  - 웹 빌드에는 `.env` 키가 JS 에 그대로 들어가므로 공개 배포 전에는 서버 프록시(또는 키 없는 빌드)가 필요
- 바이브코딩 성과 전시관(kepco-vibe-exhibition.vercel.app)에 GitHub 링크로 등록
