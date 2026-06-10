import Anthropic from "@anthropic-ai/sdk";
import { CONFIG } from "@/core/config";
import type { MenuImage } from "@/providers/dgu/scrape";
import type { DguMeal } from "@/providers/dgu/types";

// 마인드로직(동국대) 게이트웨이의 Anthropic-native 엔드포인트로 고정.
const GATEWAY_BASE_URL = "https://factchat-cloud.mindlogic.ai/v1/gateway/claude";
// 게이트웨이가 허용하는 모델만 사용 가능 (GET /v1/gateway/models/ 로 확인).
const OCR_MODEL = "claude-opus-4-8";
const TOOL_NAME = "submit_weekly_menu";

interface OcrCorner {
  name: string;
  price: string;
  items: string[];
}

interface OcrMeal {
  time: string;
  operatingHours: string;
  corners: OcrCorner[];
}

interface OcrDay {
  date: string;
  meals: OcrMeal[];
}

interface OcrResult {
  days: OcrDay[];
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
            meals: {
              type: "array",
              description: "식사 시간 목록 (중식, 석식)",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  time: { type: "string", description: "식사 시간 이름 — '중식' 또는 '석식'" },
                  operatingHours: {
                    type: "string",
                    description: "운영 시간 (예: '11:30~14:00'). 표기가 없으면 빈 문자열 ''",
                  },
                  corners: {
                    type: "array",
                    description: "해당 식사 시간의 코너 목록 (중식: 일반식/특식, 석식: 단일)",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        name: {
                          type: "string",
                          description: "코너 이름 (예: '일반식(A코너)', '특식(B코너)', '석식')",
                        },
                        price: {
                          type: "string",
                          description: "코너 가격, 숫자와 콤마만 (예: '6,500'). 표기가 없으면 빈 문자열 ''",
                        },
                        items: {
                          type: "array",
                          description: "메뉴 품목 이름 목록. 가격/원산지/빈 줄 제외, 대표 메뉴를 맨 앞에",
                          items: { type: "string" },
                        },
                      },
                      required: ["name", "price", "items"],
                    },
                  },
                },
                required: ["time", "operatingHours", "corners"],
              },
            },
          },
          required: ["date", "meals"],
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
    "표의 가로(열)는 요일, 세로(행)는 식사 시간(중식·석식)과 코너입니다.",
    "중식은 보통 '일반식(A코너)'과 '특식(B코너)' 두 코너, 석식은 단일 코너입니다.",
    "각 칸에는 대표 메뉴, 그 아래 품목들이 들어 있고, 행 라벨 쪽에 코너 가격과 운영 시간이 있습니다.",
    "",
    "아래 날짜들이 이 표의 각 요일 열에 순서대로 대응됩니다. 각 날짜마다 그 열의 중식·석식과 모든 코너를 추출하세요:",
    dateLines,
    "",
    "규칙:",
    "- meals[].time 은 '중식' 또는 '석식'.",
    "- corners[].name 은 코너 이름만 (예: '일반식(A코너)', '특식(B코너)', '석식').",
    "- corners[].items 에는 음식 이름만 넣고 가격(원/₩)·원산지·운영시간·빈 줄은 제외. 대표 메뉴를 맨 앞에.",
    "- price 는 숫자와 콤마만 (예: '6,500'). 없으면 빈 문자열 ''.",
    "- operatingHours 는 해당 식사 시간의 운영 시간 (예: '11:30~14:00'). 없으면 빈 문자열 ''.",
    "- 메뉴가 비어 있는 날짜는 meals 를 빈 배열로 두되, 요청된 날짜는 모두 days 에 포함하세요.",
    `- ${TOOL_NAME} 도구로만 결과를 제출하세요.`,
  ].join("\n");
}

/**
 * Run vision OCR on a weekly D-Flex menu image and return a map of
 * YYYY-MM-DD -> that day's meals (중식/석식 with their corners).
 */
export async function extractWeeklyMenu(
  image: MenuImage,
  expectedDates: { date: string; weekday: string }[],
): Promise<Map<string, DguMeal[]>> {
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
  const mealsByDate = new Map<string, DguMeal[]>();

  for (const day of result.days) {
    const meals: DguMeal[] = day.meals.map((meal) => ({
      time: meal.time,
      operatingHours: emptyToNull(meal.operatingHours),
      corners: meal.corners.map((corner) => ({
        name: corner.name,
        price: emptyToNull(corner.price),
        items: corner.items,
      })),
    }));
    mealsByDate.set(day.date, meals);
  }

  return mealsByDate;
}
