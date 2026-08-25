# bap-back — agent notes

## Product

HTTP API for [밥.net](https://밥.net). Each school/canteen is a **provider** with its own scrape pipeline and MongoDB database. Public responses use one schema (`PublicDayMenu`); internal Mongo `data` shapes differ.

Pair repo: **bap-web** (Next.js frontend). Public docs mirror: [밥.net/docs](https://밥.net/docs).

## Do

- **Provider pattern** — implement `MealProvider` in `src/providers/types.ts`. Register in `src/providers/init.ts`.
- **Public boundary** — never expose raw Mongo `data` on HTTP. Transform with `cafeteriaToPublic` or `cornerMenuToPublic` in `src/core/publicMenu.ts`.
- **Presentation in config** — `ProviderConfig.presentation` (`SitePresentation`) drives `GET /` catalog and slot order for API meals.
- **Mongo envelope** — always `{ _id: YYYY-MM-DD, data, createdAt, updatedAt }` via `MongoDBService.saveMealData`.
- **Routes** — only under `/{basePath}/…` (e.g. `/kdmhs/2026-08-25`). No root `/:date` legacy paths.
- **Errors** — use `MealNotFoundError` / `MealNoOperationError` from `src/core/mealErrors.ts` for domain 404s; `ApiError` for HTTP errors.
- **Tests** — add unit tests for parsers and `publicMenu` mappers. Run `bun test` before finishing.
- **Keep `/docs` in sync** — API docs content lives in `src/core/docs.ts` (`GET /docs`). Frontend renders from that endpoint only.

## Don't

- Break the unified `PublicDayMenu` contract without updating bap-web and `/docs`.
- Add provider-specific fields to public types without a mapper and docs update.
- Store secrets in code; use env vars (`MONGODB_URI`, `MINDLOGIC_KEY`).
- Assume `database.connected` in health is a live ping (currently always `true`).

## Key paths

| Path | Role |
|---|---|
| `src/server.ts` | HTTP routing, CORS |
| `src/providers/registry.ts` | Path → provider lookup |
| `src/core/publicMenu.ts` | Mongo shape → `PublicDayMenu` |
| `src/core/docs.ts` | `GET /docs` payload builder |
| `src/core/types.ts` | Public API types |
| `src/core/mongodb.ts` | Upsert / read by date |
| `src/core/mealLookup.ts` | Cache miss → 404 semantics |
| `src/providers/{id}/config.ts` | `presentation`, schedule, dbName |
| `src/providers/{id}/service.ts` | Scrape + save |
| `src/providers/{id}/index.ts` | `createXxxProvider()` factory |

## Adding a provider

1. Create `src/providers/{id}/` — `config.ts`, `service.ts`, `index.ts`, scrape/ocr as needed.
2. Set `presentation.meals` slots (id, title, icon, background, `activeUntilHour`).
3. Choose mapper:
   - **Cafeteria** (breakfast/lunch/dinner + regular/plus/simple) → `cafeteriaToPublic`
   - **Corner** (meals[] + corners[]) → `cornerMenuToPublic`
4. `reg.register(createXxxProvider())` in `init.ts`.
5. Add tests; docs page auto-updates via `GET /docs`.

Optional: `handleExtraRoute` for non-standard paths (see kdmhs `/search/:food`).

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
- [ ] README + bap-web `/docs` still accurate

See [README.md](./README.md) for full API reference and deployment.
