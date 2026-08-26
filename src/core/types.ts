export interface HealthCheckResponse {
  requestId: string;
  timestamp: string;
  status: string;
  database: {
    connected: boolean;
    totalMealData: number;
    lastUpdated: Date | null;
  };
}

export interface MealResponse<TData = unknown> {
  requestId: string;
  timestamp: string;
  date: string;
  data: TData;
}

export interface MealSlotMeta {
  id: string;
  title: string;
  operatingHours: string | null;
  icon: string;
  background: string;
  activeUntilHour: number;
}

export interface SitePresentation {
  id: string;
  name: string;
  schoolName: string;
  basePath: string;
  description: string;
  keywords: string[];
  googleSiteVerification?: string;
  adsenseClient?: string;
  features: { foodSearch: boolean };
  meals: MealSlotMeta[];
}

export interface PublicMenuGroup {
  id: string;
  label: string | null;
  price: string | null;
  items: string[];
}

export interface PublicMeal {
  id: string;
  title: string;
  operatingHours: string | null;
  kcal: number | null;
  image: string | null;
  groups: PublicMenuGroup[];
}

export interface PublicDayMenu {
  meals: PublicMeal[];
}

export interface ChangelogResponse {
  requestId: string;
  timestamp: string;
  version: string;
  markdown: string;
}
