export interface DguMenuItem {
  name: string;
  price: string | null;
}

export interface DguMealInfo {
  items: DguMenuItem[];
  price: string | null;
  operatingHours: string | null;
}

export interface DguCategory {
  name: string;
  lunch: DguMealInfo | null;
  dinner: DguMealInfo | null;
}

export interface DguRestaurantMenu {
  id: string;
  name: string;
  categories: DguCategory[];
}

export interface DguCafeteriaData {
  restaurants: DguRestaurantMenu[];
}

export interface DguMealDataDocument {
  _id: string;
  data: DguCafeteriaData;
  createdAt: Date;
  updatedAt: Date;
}
