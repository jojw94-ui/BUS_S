# 부산광역시_부산버스정보시스템 (BusanBIMS) API 정리

- End Point: `https://apis.data.go.kr/6260000/BusanBIMS`
- 인증: `serviceKey` 쿼리 파라미터 (`.env`의 `BUSAN_BIMS_API_KEY`, Decoding 키 → 요청 시 URL 인코딩)
- 응답: XML, 성공 시 `resultCode=00`
- 일일 트래픽: 기능별 10,000건 (개발계정, 2026-10-21 ~ 2028-10-21)
- 참고문서: 포털의 `OpenAPI활용가이드_부산버스정보시스템_v2.0.docx`
- 실제 응답 샘플: `data/samples/` (2026-10-21 수집)

## 기능 목록

| 기능 | 경로 | 주요 파라미터 | 앱에서의 용도 |
|---|---|---|---|
| 정류소 정보 | `/busStopList` | `bstopnm`(이름), `arsno` | 정류장 검색, 좌표 → 근처 정류장 |
| 노선 정보 | `/busInfo` | `lineno`(번호, 부분일치), `lineid` | 배차간격(평시/첨두/휴일), 첫차·막차 |
| 노선 정류소 + 버스 위치 | `/busInfoByRouteId` | `lineid` | 노선 경유 정류장 순서 → 후보 노선 판별, 구간 정류장 수 / 실시간 버스 위치 |
| 정류소 도착정보 (정류장ID) | `/stopArrByBstopid` | `bstopid` | **핵심**: 정류장의 모든 노선 1·2번째 버스 도착 |
| 노선 정류소 도착정보 | `/busStopArrByBstopidLineid` | `bstopid`, `lineid` | 특정 노선만 조회 (미검증) |
| 정류소 도착정보 (ARS) | `/bitArrByArsno` | `arsno` | 위와 같은 내용, ARS번호로 조회 |

## 필드 (실측)

### busStopList
`bstopid`(정류소ID, 9자리) · `bstopnm` · `arsno`(5자리) · `gpsx`(경도) · `gpsy`(위도) · `stoptype`

### stopArrByBstopid / bitArrByArsno — 정류장 1곳의 노선별 1행
| 필드 | 의미 |
|---|---|
| `lineno`, `lineid` | 노선 번호 / 노선 ID |
| `bustype` | 일반버스, 급행버스, 마을버스, 심야버스(급행/일반) |
| `bstopidx` | 이 노선에서 해당 정류장의 순번 |
| `carno1`, `min1`, `station1` | 1번째 버스: 차량번호, 도착 예정(분), 남은 정류장 수 |
| `carno2`, `min2`, `station2` | 2번째 버스 |
| `lowplate1/2` | 저상버스 여부 |
| `seat1/2` | 잔여좌석으로 보임. **실측 전부 -1 (정보 없음)** |

### busInfoByRouteId — 노선 정류장 순서 + 운행 중 버스
- 정류장 행: `bstopidx`, `bstopnm`, `nodeid`(=bstopid), `arsno`, `avgym`, `rpoint`
- 버스가 있는 정류장 행에 추가: `carno`, `lat`, `lin`, `direction`, `gpsym`, `lowplate`
- 왕복 노선은 회차 후 정류장도 이어서 나온다 → `bstopidx` 순서로 방향 판정

### busInfo
`buslinenum`(노선번호 — 요청 파라미터는 `lineno`), `headway`, `headwaypeak`, `headwaynorm`, `headwayholi`(분), `firsttime`, `endtime`, `startpoint`, `endpoint`, `companyid`
- `lineno`는 부분일치 (83 → 183 등도 반환) → 정확히 일치하는 행만 사용
