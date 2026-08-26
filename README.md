# bap-back

[밥.net](https://밥.net) 식단 API. 학교·대학·구내식당마다 **프로바이더** 하나씩 등록하고, 공개 응답은 하나의 스키마로 통일합니다.

문서: [api.밥.net/docs](https://api.밥.net/docs) · 프론트: [bap-web](https://github.com/sspzoa/bap-web) · 에이전트: [AGENTS.md](./AGENTS.md)

## 아키텍처

```
HTTP (Elysia, src/http/app.ts)
  ├─ GET  /            카탈로그 (presentation[])
  ├─ GET  /docs        Scalar (`@elysiajs/openapi`, 스펙: /docs/openapi.json)
  ├─ POST /mcp         MCP Streamable HTTP (같은 프로바이더 레이어)
  └─ ProviderRegistry ── kdmhs | dgu | horang | …
         ├─ scrape / parse / OCR  →  MongoDB (프로바이더별 DB)
         └─ publicMenu.ts        →  PublicDayMenu (공개 API · MCP)
```

- **Mongo 저장 형식**은 프로바이더마다 다릅니다 (급식 `breakfast/lunch/dinner` vs 코너 `meals[]`).
- **API·MCP 응답**은 항상 `{ meals: PublicMeal[] }` 입니다.
- **카탈로그** (`GET /`)는 각 프로바이더 `config.presentation`을 그대로 내려줍니다. 프론트와 MCP `bap_list_providers`가 이걸 씁니다.

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
| `PUBLIC_API_URL` | `https://api.밥.net` | 공개 API 호스트 (미사용 시 Scalar server URL은 요청 호스트) |
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

Scalar. OpenAPI 스펙은 `GET /docs/openapi.json`. 등록된 프로바이더 id가 path enum에 들어갑니다.

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

### `POST /mcp`

[MCP](https://modelcontextprotocol.io) Streamable HTTP. Cursor·Claude 등 에이전트가 같은 식단 데이터를 도구로 호출합니다. 인증 없음.

Cursor (`~/.cursor/mcp.json` 또는 프로젝트 `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "밥.net": {
      "url": "https://api.밥.net/mcp"
    }
  }
}
```

| 도구 | 인자 | 설명 |
|---|---|---|
| `bap_list_providers` | — | 식당 id·끼니 슬롯·사진검색 지원 여부. 식단 질의 전에 id를 확정할 때 |
| `bap_get_meals` | `provider`, `date?`, `meal?` | 하루(또는 한 끼) 식단. `date` 생략 시 오늘(KST). `오늘`/`내일`은 호출 전에 `YYYY-MM-DD`로 |
| `bap_search_food` | `food`, `provider?` | 메뉴 이름으로 과거 급식 사진. 오늘 메뉴 목록이 아님 (`foodSearch` 프로바이더) |

리소스: `bap://providers`, `bap://meals/{provider}/{date}`.

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

백엔드만 추가하면 됩니다. HTTP `/{id}/{date}`, `GET /` 카탈로그, `GET /docs` Scalar, MCP (`bap_list_providers` · `bap_get_meals`), 프론트 홈·manifest가 **같은 presentation**으로 따라옵니다. bap-web에 `src/sites/{id}/` 나 프로바이더 id 하드코딩을 넣지 마세요.

공개 문서: [api.밥.net/docs](https://api.밥.net/docs)

### 1. 디렉터리

소문자 `id`를 정합니다. 경로·Mongo DB 이름·카탈로그 `id`가 모두 이 값을 씁니다.

```
src/providers/{id}/
  config.ts      ProviderConfig + presentation
  service.ts     수집·저장, 날짜 조회
  index.ts       createXxxProvider()
  scrape.ts      선택 — HTML/게시판
  parse.ts       선택 — 파서 (테스트하기 쉬운 순수 함수)
  ocr.ts         선택 — dgu·horang 패턴
```

참고 구현: 급식형 `src/providers/kdmhs/`, 코너·OCR형 `src/providers/dgu/`.

### 2. `config.ts`

| 필드 | 규칙 |
|---|---|
| `id` | `basePath`에서 `/`를 뺀 값과 동일 (`acme` ↔ `/acme`) |
| `dbName` | 프로바이더마다 별도 DB 권장 |
| `collection` | 보통 `meal_data` |
| `schedule` | `day`는 `Date#getDay()` (0=일 … 6=토). `today`는 해당 날짜, `all`은 주간·전체 재수집 |
| `presentation` | `GET /`에 그대로 나갑니다. 프론트·MCP가 이 JSON만 봅니다 |

`presentation.meals` 슬롯은 빠짐없이 채웁니다. `icon`·`background`는 bap-web `public` 경로입니다. 기존 `/icon/lunch.svg`, `/img/lunch.svg`를 재사용하면 프론트 변경이 없습니다.

코너 매퍼를 쓸 때는 Mongo `meal.time`과 `slot.title`이 같아야 합니다 (예: `"중식"`).

### 3. `MealProvider`

`src/providers/types.ts`의 `MealProvider`를 `index.ts`에서 구현합니다.

- `getMealData(date)` → **`PublicDayMenu`만**. raw Mongo `data`를 HTTP에 올리지 마세요.
- 조회는 `getCachedMealDataOrThrow` (`src/core/mealLookup.ts`) — 범위 밖은 `MealNotFoundError`, 범위 안 빈 날짜는 `MealNoOperationError`.
- 저장은 `MongoDBService.saveMealData` — envelope `{ _id, data, createdAt, updatedAt }`.
- 매퍼:
  - 급식 `breakfast/lunch/dinner` + regular/plus/simple → `cafeteriaToPublic`
  - `meals[].time` + `corners[]` → `cornerMenuToPublic`
  - 그 외는 `PublicDayMenu`만 맞추면 됩니다.
- 메뉴 사진 검색이 필요하면 `presentation.features.foodSearch: true` 와 `handleExtraRoute` (`/search/:food`)를 같이 구현합니다. Elysia `GET /:provider/search/:food`와 MCP `bap_search_food`가 이 훅을 재사용합니다.
- `src/http/app.ts`에 프로바이더 전용 경로를 추가하지 마세요. 표준 라우트는 `/:provider/health`, `/:provider/:date`, `/:provider/search/:food`입니다.

### 4. 등록

`src/providers/init.ts`에 `reg.register(createXxxProvider())`.

### 5. 테스트

파서·매퍼 단위 테스트를 넣고 `bun test`를 돌립니다. 라우트 계약은 `src/http/app.test.ts`에서 `app.handle`로 검증합니다. Mongo·OCR 테스트는 없습니다.

### 6. 프론트

기본은 **수정 없음**. 새 아이콘·배경이 필요할 때만 bap-web `public/icon`, `public/img`에 파일을 넣고 `presentation` URL을 맞춥니다. 상세는 [bap-web README](https://github.com/sspzoa/bap-web#새-사이트-추가).

### 체크리스트

- [ ] `getMealData`가 `PublicDayMenu`를 반환한다
- [ ] `presentation.meals` (id, title, icon, background, `activeUntilHour`)가 완전하다
- [ ] `init.ts`에만 등록했고 `src/http/app.ts`에 경로를 넣지 않았다
- [ ] 파서·매퍼 테스트가 있다
- [ ] bap-web에 프로바이더 id를 하드코딩하지 않았다
- [ ] `foodSearch`를 켜면 `handleExtraRoute`도 구현했다

## 디렉터리

```
src/
  core/          공통 타입, Mongo, publicMenu, 스케줄러
  http/          Elysia 앱, `t` 모델, OpenAPI 메타
  mcp/           MCP 도구·리소스 (프로바이더 레이어 재사용)
  providers/     프로바이더별 scrape·service·config
  server.ts      프로바이더 init · listen · 스케줄러 · shutdown
  index.ts       진입점
```

## 테스트

```bash
bun test
```

변환·라우팅·파싱 단위 테스트와 Elysia `app.handle` HTTP 테스트 포함. OCR·Mongo 테스트는 없음.

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
