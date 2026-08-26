# bap-back — agent notes

## Product

HTTP API for [밥.net](https://밥.net). Each school/canteen is a **provider** with its own scrape pipeline and MongoDB database. Public responses use one schema (`PublicDayMenu`); internal Mongo `data` shapes differ.

Pair repo: **bap-web** (Next.js frontend). API docs: [api.밥.net/docs](https://api.밥.net/docs) (Scalar, served here).

## Do

- **Provider pattern** — implement `MealProvider` in `src/providers/types.ts`. Register in `src/providers/init.ts`.
- **Public boundary** — never expose raw Mongo `data` on HTTP. Transform with `cafeteriaToPublic` or `cornerMenuToPublic` in `src/core/publicMenu.ts`.
- **Presentation in config** — `ProviderConfig.presentation` (`SitePresentation`) drives `GET /` catalog and slot order for API meals.
- **Mongo envelope** — always `{ _id: YYYY-MM-DD, data, createdAt, updatedAt }` via `MongoDBService.saveMealData`.
- **Routes** — meal routes only under `/{basePath}/…` (e.g. `/kdmhs/2026-08-25`). Root exceptions: `/`, `/changelog`, `/docs`, `/mcp`. No `/:date` legacy paths.
- **Errors** — use `MealNotFoundError` / `MealNoOperationError` from `src/core/mealErrors.ts` for domain 404s; `ApiError` for HTTP errors.
- **Tests** — add unit tests for parsers, `publicMenu` mappers, and MCP tools. Run `bun test` before finishing.
- **Keep `/docs` in sync** — OpenAPI lives in `src/core/docs.ts` (`GET /docs` Scalar, `GET /docs/openapi.json`). MCP tools stay aligned with the same public schema.
- **Version on push** — 커밋·푸시 전에 semver를 올리고 **bap-web과 같은 번호**로 맞춘다. 아래 [Versioning](#versioning) 참고.

## Don't

- Break the unified `PublicDayMenu` contract without updating bap-web, `/docs`, and MCP tools.
- Add provider-specific fields to public types without a mapper and docs update.
- Store secrets in code; use env vars (`MONGODB_URI`, `MINDLOGIC_KEY`).
- Assume `database.connected` in health is a live ping (currently always `true`).

## Key paths

| Path | Role |
|---|---|
| `src/server.ts` | HTTP routing, CORS |
| `src/providers/registry.ts` | Path → provider lookup |
| `src/core/publicMenu.ts` | Mongo shape → `PublicDayMenu` |
| `src/core/docs.ts` | OpenAPI spec + Scalar |
| `src/mcp/server.ts` | MCP tools (`bap_list_providers`, `bap_get_meals`, `bap_search_food`) |
| `src/core/types.ts` | Public API types |
| `src/core/version.ts` | `APP_VERSION` — OpenAPI, MCP, `package.json`과 동기화 |
| `CHANGELOG.md` | 사용자-facing 변경 이력 (`GET /changelog`) |
| `src/core/changelog.ts` | CHANGELOG.md 로더 |
| `src/core/mongodb.ts` | Upsert / read by date |
| `src/core/mealLookup.ts` | Cache miss → 404 semantics |
| `src/providers/{id}/config.ts` | `presentation`, schedule, dbName |
| `src/providers/{id}/service.ts` | Scrape + save |
| `src/providers/{id}/index.ts` | `createXxxProvider()` factory |

## Adding a provider

Do this in **bap-back only**. Do not add `src/sites/{id}/` or hardcode the id in bap-web. HTTP, Scalar (`GET /docs`), MCP (`bap_list_providers` / `bap_get_meals`), and the frontend catalog all read `presentation`.

1. Create `src/providers/{id}/` — `config.ts`, `service.ts`, `index.ts`, plus scrape/parse/ocr as needed. `id` === `basePath` without `/`.
2. Fill `presentation` (`SitePresentation`): name, schoolName, keywords, `features.foodSearch`, and `meals` slots (`id`, `title`, `icon`, `background`, `activeUntilHour`). Existing `/icon/*.svg` and `/img/*.svg` need no frontend change.
3. Implement `MealProvider` in `index.ts`. `getMealData` must return `PublicDayMenu` via:
   - **Cafeteria** — `cafeteriaToPublic`
   - **Corner** — `cornerMenuToPublic` (Mongo `meal.time` must equal `slot.title`)
   - **Custom** — map to `PublicDayMenu` yourself
   Use `getCachedMealDataOrThrow` + `saveMealData`. Never expose raw Mongo `data`.
4. `reg.register(createXxxProvider())` in `init.ts` only. Do not add routes in `server.ts`.
5. Parser/mapper tests; `bun test`. Scalar spec and MCP update from the registry — no hardcoded provider list in the spec.
6. Optional: `handleExtraRoute` + `features.foodSearch` for `/{id}/search/:food` (MCP `bap_search_food` reuses this).

Full walkthrough: [README.md](./README.md#새-프로바이더-추가) · public docs: [api.밥.net/docs](https://api.밥.net/docs).

## Versioning

푸시(또는 커밋 요청)마다 에이전트가 **알아서** 버전을 올린다. 사용자에게 묻지 않는다.

- **단일 소스** — `src/core/version.ts`의 `APP_VERSION`. OpenAPI·MCP는 여기서 읽는다.
- **함께 수정** — `package.json` `"version"`. **bap-web**도 같은 semver (`BRAND.version`, `package.json`).
- **CHANGELOG** — 루트 `CHANGELOG.md`에 `## [버전] - YYYY-MM-DD` 섹션 추가. `GET /changelog`는 HTML 페이지. 프론트 홈 링크가 이 URL을 연다.
- **규칙** — 기본은 patch +1 (`2.0.0` → `2.0.1`). 사용자-facing 기능 추가는 minor. `PublicDayMenu`·HTTP 계약 breaking은 major.
- **체크** — 버전 bump 없이 푸시/커밋하지 않는다. CHANGELOG 없이 버전만 올리지 않는다.

## Environment

| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI` | prod | Local default `mongodb://localhost:27017` |
| `MINDLOGIC_KEY` | dgu, horang | OCR gateway |
| `PORT` | — | Default 3000 |
| `TZ` | deploy | `Asia/Seoul` for scheduler |

## Commands

```bash
bun install
MONGODB_URI=mongodb://127.0.0.1:27017 bun start
bun test
bun run lint
```

## Mongo vs API

| Layer | kdmhs | dgu · horang |
|---|---|---|
| Mongo `data` | `{ breakfast, lunch, dinner }` each with regular/plus/simple | `{ meals: [{ time, corners[] }] }` |
| Public API | same `PublicDayMenu` | same `PublicDayMenu` |

## Review checklist

- [ ] `getMealData` returns `PublicDayMenu`
- [ ] New routes registered via provider, not ad-hoc in `server.ts`
- [ ] `presentation` complete for frontend catalog
- [ ] Tests for new parse/map logic
- [ ] README + OpenAPI (`GET /docs`) still accurate
- [ ] No bap-web hardcoded provider id; MCP needs no extra change for a standard provider
- [ ] Version bumped (`APP_VERSION`, `package.json`) and matches bap-web if both repos ship together
- [ ] `CHANGELOG.md` updated for the new version

See [README.md](./README.md) for full API reference and deployment.
