import { t } from "elysia";

const RequestEnvelope = {
  requestId: t.String(),
  timestamp: t.String({ format: "date-time" }),
};

export const ErrorResponse = t.Object(
  {
    ...RequestEnvelope,
    error: t.String(),
  },
  { title: "ErrorResponse" },
);

export const MealSlotMeta = t.Object(
  {
    id: t.String({ examples: ["lunch"] }),
    title: t.String({ examples: ["점심"] }),
    operatingHours: t.Nullable(t.String({ examples: ["11:30~14:00"] })),
    icon: t.String({ examples: ["/icon/lunch.svg"] }),
    background: t.String({ examples: ["/img/lunch.svg"] }),
    activeUntilHour: t.Integer({ examples: [14] }),
  },
  { title: "MealSlotMeta" },
);

export const SitePresentation = t.Object(
  {
    id: t.String({ description: "basePath에서 슬래시를 뺀 값", examples: ["kdmhs"] }),
    name: t.String({ examples: ["디미고 급식"] }),
    schoolName: t.String({ examples: ["한국디지털미디어고등학교"] }),
    basePath: t.String({ examples: ["/kdmhs"] }),
    description: t.String(),
    keywords: t.Array(t.String()),
    googleSiteVerification: t.Optional(t.String()),
    adsenseClient: t.Optional(t.String()),
    features: t.Object({
      foodSearch: t.Boolean(),
    }),
    meals: t.Array(MealSlotMeta),
  },
  { title: "SitePresentation" },
);

export const CatalogResponse = t.Object(
  {
    ...RequestEnvelope,
    message: t.String({ examples: ["api.밥.net"] }),
    providers: t.Array(SitePresentation),
  },
  { title: "CatalogResponse" },
);

export const PublicMenuGroup = t.Object(
  {
    id: t.String({ description: "regular · plus · simple 또는 코너 이름" }),
    label: t.Nullable(t.String({ examples: ["플러스바"] })),
    price: t.Nullable(t.String({ examples: ["6500"] })),
    items: t.Array(t.String()),
  },
  { title: "PublicMenuGroup" },
);

export const PublicMeal = t.Object(
  {
    id: t.String({ examples: ["lunch"] }),
    title: t.String({ examples: ["점심"] }),
    operatingHours: t.Nullable(t.String()),
    kcal: t.Nullable(t.Number({ examples: [812] })),
    image: t.Nullable(t.String()),
    groups: t.Array(PublicMenuGroup),
  },
  { title: "PublicMeal" },
);

export const PublicDayMenu = t.Object(
  {
    meals: t.Array(PublicMeal),
  },
  { title: "PublicDayMenu" },
);

export const MealResponse = t.Object(
  {
    ...RequestEnvelope,
    date: t.String({ format: "date" }),
    data: PublicDayMenu,
  },
  { title: "MealResponse" },
);

export const SearchResponse = t.Object(
  {
    ...RequestEnvelope,
    foodName: t.String(),
    matchedMenu: t.Optional(t.String()),
    image: t.String(),
    date: t.String({ format: "date" }),
    mealType: t.String({ examples: ["lunch"] }),
    section: t.Optional(
      t.Union([t.Literal("regular"), t.Literal("plus"), t.Literal("simple")], {
        description: "kdmhs 전용",
      }),
    ),
  },
  { title: "SearchResponse" },
);

export const HealthResponse = t.Object(
  {
    ...RequestEnvelope,
    status: t.String({ examples: ["ok"] }),
    database: t.Object({
      connected: t.Boolean({ description: "현재 항상 true (실시간 ping 아님)" }),
      totalMealData: t.Integer(),
      lastUpdated: t.Nullable(t.String({ format: "date-time" })),
    }),
  },
  { title: "HealthResponse" },
);

export const apiModels = {
  ErrorResponse,
  MealSlotMeta,
  SitePresentation,
  CatalogResponse,
  PublicMenuGroup,
  PublicMeal,
  PublicDayMenu,
  MealResponse,
  SearchResponse,
  HealthResponse,
};
