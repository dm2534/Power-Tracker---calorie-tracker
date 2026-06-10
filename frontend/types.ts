export interface UserProfile {
  id: string;
  displayName: string;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
  birthDate: string;
  age: number;
  sex: 'M' | 'F';
  goal: 'cut' | 'maintain' | 'bulk';
  dietType: string;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  calorieTarget: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
  createdAt: string;
}

export interface DailyActivity {
  id?: string;
  userId: string;
  logDate: string; // YYYY-MM-DD
  caloriesBurnt: number;
  waterIngestedMl: number;
  steps: number;
  updatedAt?: string;
}

export interface FoodItem {
  name: string;
  quantity: string;
  quantity_grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

export interface GeminiNutritionResponse {
  food_items: FoodItem[];
  totals: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    sugar_g: number;
  };
  overall_confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  suggestions: string[];
}

export interface FoodLog {
  id: string;
  userId: string;
  loggedAt: string;
  entryType: 'image' | 'text' | 'both';
  imageUrl?: string;
  rawInput?: string;
  geminiResponse: GeminiNutritionResponse;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  foodName: string;
}
