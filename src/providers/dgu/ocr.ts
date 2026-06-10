import Anthropic from "@anthropic-ai/sdk";
import { CONFIG } from "@/core/config";
import type { MenuImage } from "@/providers/dgu/scrape";
import type { DguCategory } from "@/providers/dgu/types";

// 마인드로직(동국대) 게이트웨이의 Anthropic-native 엔드포인트로 고정.
const GATEWAY_BASE_URL = "https://factchat-cloud.mindlogic.ai/v1/gateway/claude";
const OCR_MODEL = "claude-sonnet-4-6";
const TOOL_NAME = "submit_weekly_menu";

interface OcrItem {
  name: string;
}

interface OcrCategory {
  name: string;
  price: string;
  operatingHours: string;
  items: OcrItem[];
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface OcrDay {
  date: string;
  categories: OcrCategory[];
}

interface OcrResult {
  days: OcrDay[];
}

const MENU_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "동국대학교 경영관 D-Flex 식당의 주간 식단표 이미지에서 추출한 메뉴를 날짜별로 제출합니다.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      days: {
        type: "array",
        description: "요청된 각 날짜별 메뉴",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            date: { type: "string", description: "YYYY-MM-DD 형식의 날짜" },
            categories: {
              type: "array",
              description: "해당 날짜의 식사 코너 목록 (중식 반식/특식, 석식 등)",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: {
                    type: "string",
                    description:
                      "코너 이름. 식사 시간과 코너를 함께 표기 (예: '중식 · 반식(A코너)', '중식 · 특식(B코너)', '석식')",
                  },
                  price: {
                    type: "string",
                    description: "코너 가격. 숫자와 콤마만 (예: '6,500'). 표기가 없으면 빈 문자열 ''",
                  },
                  operatingHours: {
                    type: "string",
                    description: "운영 시간 (예: '11:30~14:00'). 표기가 없으면 빈 문자열 ''",
                  },
                  items: {
                    type: "array",
                    description: "메뉴 품목 목록. 가격/원산지/빈 줄은 제외하고 음식 이름만",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        name: { type: "string", description: "음식 이름" },
                      },
                      required: ["name"],
                    },
                  },
                },
                required: ["name", "price", "operatingHours", "items"],
              },
            },
          },
          required: ["date", "categories"],
        },
      },
    },
    required: ["days"],
  },
};

function buildPrompt(expectedDates: { date: string; weekday: string }[]): string {
  const dateLines = expectedDates.map((d) => `- ${d.date} (${d.weekday}요일)`).join("\n");
  return [
    "이 이미지는 동국대학교 경영관 D-Flex 식당의 한 주간 식단표입니다.",
    "표의 가로(열)는 요일, 세로(행)는 식사 시간(중식·석식)과 코너(반식/A코너, 특식/B코너 등)입니다.",
    "각 칸에는 코너 가격, 대표 메뉴명, 그리고 그 아래 음식 품목들이 들어 있습니다.",
    "",
    "아래 날짜들이 이 표의 각 요일 열에 순서대로 대응됩니다. 각 날짜마다 그 열의 모든 코너를 추출하세요:",
    dateLines,
    "",
    "규칙:",
    "- 코너 이름(name)에는 식사 시간과 코너를 함께 표기하세요 (예: '중식 · 반식(A코너)', '중식 · 특식(B코너)', '석식').",
    "- items에는 음식 이름만 넣고, 가격(원/₩)·원산지 표기·운영시간·빈 줄은 제외하세요.",
    "- 가격(price)은 숫자와 콤마만 (예: '6,500'). 표기가 없으면 빈 문자열 ''.",
    "- operatingHours는 해당 식사 시간의 운영 시간 (예: '11:30~14:00'). 없으면 빈 문자열 ''.",
    "- 메뉴가 비어 있는 날짜는 categories를 빈 배열로 두되, 요청된 날짜는 모두 days에 포함하세요.",
    `- ${TOOL_NAME} 도구로만 결과를 제출하세요.`,
  ].join("\n");
}

/**
 * Run vision OCR on a weekly D-Flex menu image and return a map of
 * YYYY-MM-DD -> the day's categories (already shaped for DguCafeteriaData).
 */
export async function extractWeeklyMenu(
  image: MenuImage,
  expectedDates: { date: string; weekday: string }[],
): Promise<Map<string, DguCategory[]>> {
  if (!CONFIG.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured; cannot run D-Flex menu OCR");
  }

  // 키는 x-api-key 헤더로 전송됨 (게이트웨이/Anthropic 모두 동일).
  const client = new Anthropic({ apiKey: CONFIG.ANTHROPIC_API_KEY, baseURL: GATEWAY_BASE_URL });

  const response = await client.messages.create({
    model: OCR_MODEL,
    max_tokens: 16000,
    tools: [MENU_TOOL],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
          { type: "text", text: buildPrompt(expectedDates) },
        ],
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("D-Flex menu OCR returned no tool_use block");
  }

  const result = toolUse.input as OcrResult;
  const menuByDate = new Map<string, DguCategory[]>();

  for (const day of result.days) {
    const categories: DguCategory[] = day.categories.map((category) => ({
      name: category.name,
      lunch: {
        items: category.items.map((item) => ({ name: item.name, price: null })),
        price: emptyToNull(category.price),
        operatingHours: emptyToNull(category.operatingHours),
      },
      dinner: null,
    }));
    menuByDate.set(day.date, categories);
  }

  return menuByDate;
}
