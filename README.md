# bap-back

[밥.net](https://밥.net) 식단 API. 학교·대학·구내식당마다 **프로바이더** 하나씩 등록하고, 공개 응답은 하나의 스키마로 통일합니다.

웹 문서: [밥.net/docs](https://밥.net/docs) · 프론트: [bap-web](https://github.com/sspzoa/bap-web) · 에이전트: [AGENTS.md](./AGENTS.md)

## 아키텍처

```
HTTP (server.ts)
  └─ ProviderRegistry ── kdmhs | dgu | horang
         ├─ scrape / parse / OCR  →  MongoDB (프로바이더별 DB)
         └─ publicMenu.ts        →  PublicDayMenu (공개 API)
```

- **Mongo 저장 형식**은 프로바이더마다 다릅니다 (급식 `breakfast/lunch/dinner` vs 코너 `meals[]`).
- **API 응답**은 항상 `{ meals: PublicMeal[] }` 입니다.
- **카탈로그** (`GET /`)는 각 프로바이더 `config.presentation`을 그대로 내려줍니다.

## 빠른 시작

```bash
bun install
MONGODB_URI=mongodb://127.0.0.1:27017 bun start   # 기본 :3000
```

| 프로바이더 | 로컬에서 식단 적재 | 비고 |
|---|---|---|
| kdmhs | ✅ HTML 스크래핑 | `MINDLOGIC_KEY` 불필요 |
| dgu, horang | ❌ OCR 필요 | `MINDLOGIC_KEY` 없으면 refresh 실패 |

```bash
bun test
bun run lint
```

## 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3000` | HTTP 포트 |
| `MONGODB_URI` | `mongodb://localhost:27017` | Mongo 연결 문자열 |
| `MINDLOGIC_KEY` | `""` | dgu·horang OCR (Mindlogic 게이트웨이) |
| `PUBLIC_API_URL` | `https://api.밥.net` | 문서·curl 예시에 쓰는 공개 API URL |
| `LOG_LEVEL` | `INFO` | 로그 레벨 |
| `NODE_ENV` | — | `production`이면 CORS에서 localhost 제외 |

Docker 이미지는 `TZ=Asia/Seoul`. 식단은 **스케줄러**가 프로바이더별 `schedule`에 따라 자동 수집합니다. 수동 refresh HTTP API는 없습니다.

## API

### `GET /`

등록된 프로바이더 카탈로그 (`SitePresentation[]`).

```json
{
  "requestId": "...",
  "timestamp": "...",
  "message": "api.밥.net",
  "providers": [
    {
      "id": "kdmhs",
      "name": "디미고 급식",
      "schoolName": "한국디지털미디어고등학교",
      "basePath": "/kdmhs",
      "description": "...",
      "keywords": ["..."],
      "features": { "foodSearch": true },
      "meals": [
        {
          "id": "breakfast",
          "title": "아침",
          "operatingHours": null,
          "icon": "/icon/breakfast.svg",
          "background": "/img/breakfast.svg",
          "activeUntilHour": 8
        }
      ]
    }
  ]
}
```

### `GET /docs`

프론트 `/docs` 페이지가 불러오는 API 문서 JSON. `providers` + `docs`(TOC, 엔드포인트, 타입, 오류) 포함.

### `GET /{provider}/{YYYY-MM-DD}`

```json
{
  "requestId": "...",
  "timestamp": "...",
  "date": "2026-08-25",
  "data": {
    "meals": [
      {
        "id": "lunch",
        "title": "중식",
        "operatingHours": "11:30~14:00",
        "kcal": null,
        "image": null,
        "groups": [
          { "id": "A코너", "label": "반식(A코너)", "price": "6500", "items": ["..."] }
        ]
      }
    ]
  }
}
```

- kdmhs: `groups` = regular / plus(플러스바) / simple(간편식), `kcal`·`image` 채워짐
- dgu·horang: `groups` = 코너, `price` 있음

### `GET /{provider}/health`

DB 문서 수·마지막 갱신 시각. `database.connected`는 현재 **항상 `true`** (실제 ping 아님 — 개선 예정).

### `GET /kdmhs/search/{food}`

과거 메뉴 사진 검색 (kdmhs 전용).

### 오류

```json
{ "requestId": "...", "timestamp": "...", "error": "식단 정보가 없어요" }
```

| HTTP | 메시지 예 | 의미 |
|---|---|---|
| 404 | `식단 정보가 없어요` | 저장된 날짜 범위 밖 |
| 404 | `식단 운영이 없어요` | 범위 안이지만 데이터 없음 |
| 400 | `Invalid date format` | 날짜 형식 오류 |

루트 `/:date` 같은 레거시 경로는 **없습니다**.

## 프로바이더

| ID | basePath | Mongo DB | 수집 | 끼니 |
|---|---|---|---|---|
| kdmhs | `/kdmhs` | `bap` | HTML | 아침·점심·저녁 |
| dgu | `/dgu` | `dgu-bap` | OCR | 중·석 |
| horang | `/horang` | `horang-bap` | OCR | 중·석 |

Mongo 문서 envelope (공통):

```json
{
  "_id": "2026-08-25",
  "data": { "...프로바이더별..." },
  "createdAt": "...",
  "updatedAt": "..."
}
```

## 새 프로바이더 추가

1. `src/providers/{id}/` — `config.ts`, `service.ts`, `index.ts` (+ scrape/ocr)
2. `createXxxProvider()`에서 `MealProvider` 구현
3. `src/providers/init.ts`에 `reg.register(...)`
4. `presentation.meals` 슬롯 정의
5. 저장 형식이 기존과 같으면 `cafeteriaToPublic` 또는 `cornerMenuToPublic` 재사용

## 디렉터리

```
src/
  core/          공통 타입, Mongo, publicMenu 변환, 스케줄러
  providers/     프로바이더별 scrape·service·config
  server.ts      HTTP 라우팅
  index.ts       진입점
```

## 테스트

```bash
bun test
```

변환·라우팅·파싱 단위 테스트 포함. HTTP 통합·OCR·Mongo 테스트는 없음.

## 배포

GitHub Actions → GHCR → Coolify. Docker:

```bash
docker build -t bap-back .
docker run -p 3000:3000 \
  -e MONGODB_URI=... \
  -e MINDLOGIC_KEY=... \
  bap-back
```

## 알려진 이슈

- dgu·horang OCR 실패 시 `{ meals: [] }`를 저장해 200 빈 슬롯으로 나갈 수 있음
- horang full refresh는 게시글 1페이지만 조회 (dgu는 2페이지)
- dgu·horang 코드 중복 (공통 OCR 모듈화 여지)
