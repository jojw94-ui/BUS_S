# BUS_S — 부산 버스 선택 추천

출발 정류장에서 도착 정류장까지 가는 버스 노선이 여러 개일 때, **지금 탈 버스 하나**를 골라 주는 앱입니다.
지도 앱은 "가장 빠른 경로"를 보여 주지만, 같은 정류장에서 어느 버스를 탈지는 직접 비교해야 합니다. 이 앱은 그 비교를 대신합니다.

- 시연 영상: https://www.loom.com/share/84128114ea9440f7a216f76dd8c2d6ea
- 한전 직무교육 · 업무자동화 바이브코딩 결과물

## 어떻게 고르나

우선순위는 다음 순서입니다.

1. **혼잡도** — 덜 붐비는 버스
2. **총 소요시간** — 기다리는 시간 + 출발→도착 이동시간
3. **같은 노선의 다음 버스** — 첫 차가 붐비고 다음 차가 곧 오면 "보내고 다음 차 타기"를 추천

부산 BIMS 공개 API에는 실시간 혼잡도 정보가 없습니다. 그래서 혼잡도는 **추정값**입니다.
버스노선별 30분 단위 승하차 통계(2023-07-31)로 정류장·시간대별 평소 재차인원을 구하고, 여기에 실시간 배차 간격을 반영합니다. 앞차와 간격이 벌어진 버스일수록 더 붐빈다고 봅니다.

## 주요 기능

- **구간 설정**: 출근·퇴근 같은 구간을 저장합니다. 출발·도착 정류장은 여러 곳을 지정할 수 있습니다.
- **방향 자동 전환**: 구간 하나로 반대 방향(예: 퇴근)도 추천합니다. 시간대·현재 위치에 따라 자동으로 바뀌고, 직접 바꿀 수도 있습니다.
- **정류장 검색**: 이름이나 ARS 번호로 찾습니다. 같은 이름의 정류장이 길 양쪽에 있어서 "○○ 방면"으로 구분합니다.
- **실시간 도착정보**: 30초마다 갱신됩니다.

## 직접 실행하기

### 1. 준비

- Node.js 20 이상
- 공공데이터포털(https://www.data.go.kr) API 키
  - "부산광역시_부산버스정보시스템"을 검색해 활용신청합니다(자동 승인, 무료).
  - 마이페이지에서 **일반 인증키**를 복사합니다. Encoding·Decoding 키 어느 쪽이든 됩니다.

### 2. 설치

```bash
git clone https://github.com/jojw94-ui/BUS_S.git
cd BUS_S
npm ci
```

### 3. API 키 넣기 (둘 중 하나)

- **빌드에 넣기**: `app/.env.example`을 `app/.env`로 복사하고 `EXPO_PUBLIC_BUSAN_BIMS_API_KEY=`에 키를 넣습니다.
- **앱에서 입력**: 키 없이 실행한 뒤 [구간 설정] 탭 아래 "API 키"에 붙여 넣습니다. 키는 그 기기에만 저장됩니다.

> `EXPO_PUBLIC_` 값은 앱 번들(JS)에 그대로 들어갑니다. 키를 넣어 빌드한 결과물을 공개된 곳에 올리지 마세요.
> `.env`는 커밋하지 않습니다(`.gitignore`에 있음).

### 4. 실행

```bash
cd app
npm run web        # 브라우저에서 실행 (개발 서버)
npm start          # Expo Go 앱으로 휴대폰에서 실행
```

웹 정적 빌드: `npx expo export --platform web` → `app/dist/`

### 5. 테스트

```bash
cd packages/core
npm test           # 추천 로직 단위 테스트
```

### 안드로이드 APK (선택)

`app/scripts/apk/build-apk.ps1`로 Windows에서 개인 설치용 APK를 만들 수 있습니다.
JDK 17과 Android SDK가 `%LOCALAPPDATA%\bus-s-toolchain`에 있어야 합니다. 자세한 내용은 스크립트 첫 부분 주석을 보세요.
`-NoBuiltinKey`를 붙이면 키를 넣지 않은 APK가 만들어집니다. 다른 사람에게 줄 때 쓰고, 받은 사람은 앱에서 각자 키를 입력합니다.

## 폴더 구조

| 경로 | 내용 |
|---|---|
| `packages/core/` | 추천 로직 (순수 TypeScript, 단위 테스트) |
| `app/` | Expo(React Native) 앱 — 안드로이드·웹. API 호출은 `app/src/api/` |
| `data/static/` | 정류장·노선·혼잡도 프로필 (앱에 포함되는 정적 데이터) |
| `data/raw/` | 승하차 통계 원본 |
| `data/samples/` | 실제 API 응답 샘플 (테스트 입력) |
| `scripts/` | 정적 데이터 수집·생성 스크립트 |
| `docs/` | 제안서(`PROPOSAL.md`), 진행 기록(`progress.md`), API 조사, 결정 기록 |

## 정적 데이터 다시 만들기 (선택)

저장소에 이미 들어 있으므로 보통은 필요 없습니다. 노선이 바뀌었을 때만 다시 만듭니다.
이 스크립트들은 저장소 루트 `.env`의 `BUSAN_BIMS_API_KEY`를 씁니다(`.env.example` 참고).

```bash
node scripts/fetch-routes.mjs              # 시내버스 노선 + 경유 정류장 → data/static/routes.json
node scripts/fetch-stops.mjs               # 부산 전체 정류장 → data/static/stops.json
node scripts/build-congestion-profile.mjs  # 승하차 통계 → data/static/congestion-profile.json
```

## 한계

- 혼잡도는 실측이 아닌 추정입니다(하루치 승하차 통계 기반).
- 환승 경로, 마을버스, 도시철도 연계는 다루지 않습니다.
- 데이터 출처: 부산광역시 부산버스정보시스템(BIMS) Open API, 부산 버스노선별 승하차 통계 — 공공데이터포털
