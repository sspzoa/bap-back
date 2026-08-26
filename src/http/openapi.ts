import { CONFIG } from "@/core/config";
import { APP_VERSION } from "@/core/version";
import type { ProviderRegistry } from "@/providers/registry";

export function openapiInfo(registry: ProviderRegistry) {
  const ids = registry.getProviders().map((provider) => provider.config.id);
  const providerList = ids.length > 0 ? ids.join(", ") : "등록된 프로바이더 없음";

  return {
    title: "밥.net API",
    version: APP_VERSION,
    description: [
      "오늘 뭐 나오지? 학교·식당 급식을 하나의 API로 조회하세요.",
      "",
      "어떤 프로바이더든 응답은 동일한 `PublicDayMenu` 스키마로 내려옵니다. 한 번 연동하면 새 학교가 추가돼도 코드를 고칠 필요가 없어요.",
      "",
      "### 시작하기",
      "",
      "1. `GET /` — 사용 가능한 프로바이더 목록을 확인합니다.",
      "2. `GET /{provider}/{date}` — 원하는 날짜의 식단을 가져옵니다.",
      "",
      "### 알아두기",
      "",
      "- **날짜 형식** — `YYYY-MM-DD` (KST 기준)",
      "- **공통 응답 필드** — 모든 응답에 `requestId`, `timestamp`가 포함됩니다",
      `- **프로바이더** — ${providerList}`,
      "- **인증** — 필요 없습니다. 바로 호출하세요",
      "",
      "### AI 에이전트 연동",
      "",
      "MCP를 지원합니다. `POST /mcp` (Streamable HTTP) 하나면 Cursor·Claude 같은 에이전트가 식단을 읽을 수 있어요.",
      "",
      "새 학교를 추가하고 싶다면 [bap-back README](https://github.com/sspzoa/bap-back#새-프로바이더-추가)를 참고하세요.",
    ].join("\n"),
  };
}

export function openapiServers() {
  const servers = [{ url: CONFIG.PUBLIC_API_URL, description: "프로덕션" }];
  if (process.env.NODE_ENV !== "production") {
    servers.push({
      url: `http://${CONFIG.SERVER.HOST}:${CONFIG.SERVER.PORT}`,
      description: "로컬",
    });
  }
  return servers;
}

export const openapiTags = [
  { name: "Catalog", description: "등록된 사이트와 화면 구성에 필요한 메타데이터" },
  { name: "Changelog", description: "semver별 사용자-facing 변경 이력" },
  { name: "Meals", description: "날짜별 식단 조회" },
  { name: "Search", description: "메뉴 이름으로 과거 급식 사진 찾기 (`foodSearch` 지원 프로바이더 전용)" },
  { name: "Health", description: "프로바이더별 데이터 적재 상태" },
  { name: "MCP", description: "AI 에이전트용 Model Context Protocol 엔드포인트" },
];
