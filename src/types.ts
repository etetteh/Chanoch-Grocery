export interface SaleItem {
  id: string;
  name: string;
  price: string;
  originalPrice?: string;
  validFrom?: string;
  validUntil?: string;
  store: string;
  category: string;
  description?: string;
  address?: string;
  distance?: string;
  mapsUri?: string;
  isOnSale?: boolean;
  unit?: string;
}

export interface GroceryItem {
  id: string;
  name: string;
  price?: string;
  originalPrice?: string;
  validFrom?: string;
  validUntil?: string;
  store?: string;
  quantity: number;
  unit?: string;
  completed: boolean;
  selected?: boolean;
  category: string;
  address?: string;
  distance?: string;
  mapsUri?: string;
}

export interface HealthProfile {
  dietTypes: string[];
  allergies: string[];
  goals: string[];
  dislikedIngredients: string[];
}

export interface ScannedItem {
  name: string;
  category: string;
  nutritionalInfo: {
    calories: string;
    protein: string;
    carbs: string;
    fat: string;
  };
  isAligned: boolean;
  reason?: string;
  healthierAlternative?: string;
}

export interface Meal {
  name: string;
  description?: string;
  ingredients: string[];
  recipe: string;
  prepNotes?: string;
  macros?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  cuisine?: string;
  tags?: string[];
}

export interface MealPlanDay {
  day: string;
  date?: string;
  breakfast?: Meal;
  lunch?: Meal;
  dinner?: Meal;
  snack?: Meal;
}

export interface MealPlan {
  days: MealPlanDay[];
  estimatedCost?: number;
  budgetWarning?: string;
}

export type Tab = 'search' | 'list' | 'profile' | 'scanner' | 'meal-plan';
