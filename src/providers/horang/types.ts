export interface HorangMenuCorner {
  /** 코너 이름 — "자율배식", "Take-Out", "도시락", "샐러데이" 등 */
  name: string;
  /** 코너 가격 — "6,500" (숫자+콤마). 없으면 null */
  price: string | null;
  /** 메뉴 품목 이름 목록 */
  items: string[];
}

export interface HorangMeal {
  /** 식사 시간 — "중식", "석식" */
  time: string;
  /** 운영 시간 — "11:30~14:00". 없으면 null */
  operatingHours: string | null;
  corners: HorangMenuCorner[];
}

export interface HorangMenu {
  meals: HorangMeal[];
}
