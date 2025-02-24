/**
 * 전역적으로 사용되는 타입 정의
 */

export interface MealMenu {
  breakfast: string;
  lunch: string;
  dinner: string;
}

export interface MealImages {
  breakfast: string;
  lunch: string;
  dinner: string;
}

export interface MenuPost {
  documentId: string;
  title: string;
  date: string;
}

export interface CacheEntry {
  data: any;
  timestamp: number;
  expiresAt: number;
}
