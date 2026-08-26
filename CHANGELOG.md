# Changelog

밥.net 프론트·API의 사용자-facing 변경 이력입니다. [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 형식을 따릅니다. `GET /changelog`로 내려갑니다.

## [Unreleased]

## [2.0.4] - 2026-08-26

### Changed

- CHANGELOG API — `releases` 대신 `markdown` 원문 반환
- 홈 업데이트 UI — 파싱 패널 제거, 기본 마크다운 렌더 + API docs 버튼만

## [2.0.3] - 2026-08-26

### Changed

- CHANGELOG 단일 소스 — `CHANGELOG.md` → `GET /changelog`, 프론트는 API에서 조회

## [2.0.2] - 2026-08-26

### Added

- 홈 화면 **업데이트 내역** — CHANGELOG를 학교 선택 화면에 표시
- 버전 올릴 때 CHANGELOG 항목을 함께 작성하는 에이전트 규칙

## [2.0.1] - 2026-08-26

### Added

- 모바일 사이드 패널에 **홈** 메뉴 — 학교 선택 화면으로 바로 이동

## [2.0.0] - 2026-08-26

### Changed

- 학교 선택: `/select` 라우트 제거, `/` 오버레이·상태로 통합
- API 문서: 프론트 임베드 UI 제거 → [api.밥.net/docs](https://api.밥.net/docs) (Scalar)로 연결
- semver **2.0** 시작, 홈 화면에 버전 표시
- 모바일 사이드 패널에서 API 링크 제거 (문서는 홈 하단·API docs 링크)

### Added

- API: OpenAPI 3.1 스펙 + Scalar UI (`GET /docs`, `GET /docs/openapi.json`)
- API: MCP 도구 설명 개선 — `bap_list_providers`, `bap_get_meals`, `bap_search_food`
- API: `APP_VERSION` 단일 소스 (`src/core/version.ts`)

## [1.1.0] - 2026-08-25

### Added

- 카탈로그(`GET /`) 기반 통합 식단 UI — 프로바이더별 페이지 트리 제거
- API `GET /docs` 연동 문서 (당시 프론트 렌더, 이후 2.0에서 Scalar로 이전)
- MCP·프로바이더 추가 가이드를 문서에 반영

### Changed

- 식단 empty-state·공유 UI 로직 통합

## [1.0.0] - 2026-08-24

### Added

- 쿠키(`bap-site-id`) 기반 멀티 사이트 — 단일 홈 UI
- 모바일 사이드 패널(엣지 스와이프)로 학교 전환
- 데스크톱 내비게이션 바 학교 선택 버튼
- **호랑에듀** 구내식당 프로바이더 (`horang`, 구 mega)
- API MCP Streamable HTTP (`POST /mcp`)
- API 통합 public 스키마 `PublicDayMenu`, `GET /{provider}/{date}`

### Changed

- API CORS를 단일 프론트([밥.net](https://밥.net)) 기준으로 정리
- 조회 범위 안·데이터 없음(휴무·미게시)과 범위 밖 404 메시지 구분
