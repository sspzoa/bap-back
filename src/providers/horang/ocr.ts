import OpenAI from "openai";
import { CONFIG } from "@/core/config";
import type { MenuImage } from "@/providers/horang/scrape";
import type { HorangMeal } from "@/providers/horang/types";

const GATEWAY_BASE_URL = "https://factchat-cloud.mindlogic.ai/v1/gateway";
const OCR_MODEL = "gpt-5.6-luna";
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

const MENU_TOOL: OpenAI.Chat.ChatCompletionFunctionTool = {
  type: "function",
  function: {
    name: TOOL_NAME,
    description: "호랑에듀 구내식당 주간 식단표 이미지에서 추출한 메뉴를 날짜별로 제출합니다.",
    strict: true,
    parameters: {
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
                      description: "해당 식사 시간의 코너 목록",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          name: {
                            type: "string",
                            description: "코너 이름 (예: '자율배식', 'Take-Out', '도시락', '샐러데이')",
                          },
                          price: {
                            type: "string",
                            description: "코너 가격, 숫자와 콤마만 (예: '6,500'). 표기가 없으면 빈 문자열 ''",
                          },
                          items: {
                            type: "array",
                            description: "메뉴 품목 이름 목록. 가격/원산지/빈 줄/테마 배너 제외, 대표 메뉴를 맨 앞에",
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
  },
};

function buildPrompt(expectedDates: { date: string; weekday: string }[]): string {
  const dateLines = expectedDates.map((d) => `- ${d.date} (${d.weekday}요일)`).join("\n");
  return [
    "이 이미지는 호랑에듀 구내식당(horang-edu)의 한 주간 식단표입니다.",
    "표의 가로(열)는 요일(월~금), 세로(행)는 식사 시간(점심·저녁)과 코너입니다.",
    "점심(중식)은 보통 '자율배식'과 'Take-Out' 두 코너, 저녁(석식)은 보통 '도시락'과 '샐러데이' 두 코너입니다.",
    "자율배식의 대표 메뉴는 빨간 점으로 표시되어 있습니다. 표에 있는 코너는 모두 추출하세요.",
    "",
    "아래 날짜들이 이 표의 각 요일 열에 순서대로 대응됩니다. 각 날짜마다 그 열의 중식·석식과 모든 코너를 추출하세요:",
    dateLines,
    "",
    "규칙:",
    "- meals[].time 은 '중식' 또는 '석식'. 표의 '점심'은 중식, '저녁'은 석식.",
    "- corners[].name 은 코너 이름만 (예: '자율배식', 'Take-Out', '도시락', '샐러데이').",
    "- corners[].items 에는 음식 이름만 넣고 가격(원/₩)·원산지·운영시간·테마/이벤트 배너·빈 줄은 제외. 대표 메뉴를 맨 앞에.",
    "- price 는 숫자와 콤마만 (예: '6,500'). 없으면 빈 문자열 ''.",
    "- operatingHours 는 해당 식사 시간의 운영 시간. 없으면 빈 문자열 ''.",
    "- 메뉴가 비어 있는 날짜는 meals 를 빈 배열로 두되, 요청된 날짜는 모두 days 에 포함하세요.",
    `- ${TOOL_NAME} 도구로만 결과를 제출하세요.`,
  ].join("\n");
}

/**
 * Run vision OCR on a weekly Horang Edu menu image and return a map of
 * YYYY-MM-DD -> that day's meals (중식/석식 with their corners).
 */
export async function extractWeeklyMenu(
  image: MenuImage,
  expectedDates: { date: string; weekday: string }[],
): Promise<Map<string, HorangMeal[]>> {
  if (!CONFIG.MINDLOGIC_KEY) {
    throw new Error("MINDLOGIC_KEY is not configured; cannot run Horang Edu menu OCR");
  }

  const client = new OpenAI({ apiKey: CONFIG.MINDLOGIC_KEY, baseURL: GATEWAY_BASE_URL });

  const response = await client.chat.completions.create({
    model: OCR_MODEL,
    max_completion_tokens: 16000,
    reasoning_effort: "none",
    tools: [MENU_TOOL],
    tool_choice: { type: "function", function: { name: TOOL_NAME } },
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.data}` } },
          { type: "text", text: buildPrompt(expectedDates) },
        ],
      },
    ],
  });

  const toolCall = response.choices[0]?.message.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") {
    throw new Error("Horang Edu menu OCR returned no function tool call");
  }

  const result = JSON.parse(toolCall.function.arguments) as OcrResult;
  const mealsByDate = new Map<string, HorangMeal[]>();

  for (const day of result.days) {
    const meals: HorangMeal[] = day.meals.map((meal) => ({
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
