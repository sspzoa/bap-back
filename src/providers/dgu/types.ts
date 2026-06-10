export interface DguMenuCorner {
  /** 코너 이름 — "반식(A코너)", "특식(B코너)", "석식" 등 */
  name: string;
  /** 코너 가격 — "6,500" (숫자+콤마). 없으면 null */
  price: string | null;
  /** 메뉴 품목 이름 목록 */
  items: string[];
}

export interface DguMeal {
  /** 식사 시간 — "중식", "석식" */
  time: string;
  /** 운영 시간 — "11:30~14:00". 없으면 null */
  operatingHours: string | null;
  corners: DguMenuCorner[];
}

export interface DguMenu {
  meals: DguMeal[];
}
