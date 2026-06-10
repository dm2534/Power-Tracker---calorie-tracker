# Context: Project Power Tracker (Phase 1)
## Engineering Specification & Product Vision
## Architecture: Vercel + Supabase/CloudSQL/Firestore + Google Cloud Run
### 1. Project Vision & Goals
Project Power Tracker is an AI-powered nutritional analytics platform that eliminates manual data entry friction. Phase 1 focuses on two primary user archetypes: Fitness Enthusiasts (managing bulking/cutting goals) and Caregivers (monitoring nutritional compliance). Users would use this app to log their daily calorie intake and burn. User interface must include a chatbot to answer their questions about health, fitness, diet etc directly with gemini. It should then have navigation buttons and easy access to input photos, water intake, steps, calories burnt. Logging is done by the app and visualization using graphs.

The system utilizes the **Google Gen AI SDK (Gemini)** to process multimodal inputs (images + user notes) and output precise calorie, macro, and ingredient data, mapping them against real-time daily metrics like calorie burn and hydration.

---

### 2. High-Level System Workflow
1. **Onboarding:** User inputs profile data like Date of birth, weight, height, gender, target weight, and fitness goals (Bulk/Cut/Maintain) and diet type e.g., keto, vegan, etc. Use this to calculate TDEE and set targets for calories, protein, carbs, and fat.
2. **Intake Processing (NutriSnap Engine):** User uploads an image with optional notes. The backend passes these artifacts via the **Google Gen AI SDK** to Gemini. Gemini analyzes images to determine ingredients, quantity and adherence to specific dietary plans
3. **Structured Response:** Gemini returns a deterministic JSON payload containing individual food items, estimated portion sizes, and overall macro-nutrients, tips or feedback if required. The UI will display these in a user friendly manner with the option to edit the data before saving. The user can select individual items and edit them.
4. **Metrics Tracking:** Users log water intake (mL) and calories burnt manually using a simple logging screen and view a real-time caloric balance on their dashboard for the day and week. Include a daily steps tracker that integrates with Google Fit/Apple Health if user is interested, but not mandatory.

---

### 3. Database Schema (PostgreSQL)

### 3. Database Schema (Supabase / PostgreSQL)

```sql
-- Enable UUID extension if not present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USER PROFILE (Linked to Supabase Auth)
CREATE TYPE goal_type AS ENUM ('bulk', 'cut', 'maintain');

CREATE TABLE public.user_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    target_calories INT NOT NULL,
    target_protein_g INT NOT NULL,
    target_carbs_g INT NOT NULL,
    target_fat_g INT NOT NULL,
    target_water_ml INT DEFAULT 2000,
    current_goal goal_type NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS for Profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own profiles." ON public.user_profiles 
    FOR ALL USING (auth.uid() = user_id);

-- 2. DAILY ACTIVITY LOG (Hydration & Active Deficit/Surplus)
CREATE TABLE public.daily_burn_log (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    calories_burnt INT DEFAULT 0,
    water_ingested_ml INT DEFAULT 0,
    steps INT DEFAULT 0, -- Step tracking
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_date UNIQUE (user_id, log_date)
);

ALTER TABLE public.daily_burn_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own daily logs." ON public.daily_burn_log 
    FOR ALL USING (auth.uid() = user_id);

-- 3. MEAL INTAKE RECORD
CREATE TABLE public.meal_intake_log (
    meal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    image_storage_url TEXT,
    user_notes TEXT,
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_calories_calc INT NOT NULL,
    total_protein_g_calc INT NOT NULL,
    total_carbs_g_calc INT NOT NULL,
    total_fat_g_calc INT NOT NULL
);

ALTER TABLE public.meal_intake_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own meal entries." ON public.meal_intake_log 
    FOR ALL USING (auth.uid() = user_id);

-- 4. PARSED ITEM DETAILS (Populated via Cloud Run backend)
CREATE TABLE public.meal_parsed_items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_id UUID REFERENCES public.meal_intake_log(meal_id) ON DELETE CASCADE,
    food_item_name VARCHAR(255) NOT NULL,
    estimated_weight_g INT,
    calculated_calories INT NOT NULL
);

ALTER TABLE public.meal_parsed_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read items tied to their meals." ON public.meal_parsed_items 
    FOR SELECT USING (
        meal_id IN (SELECT meal_id FROM public.meal_intake_log WHERE user_id = auth.uid())
    );

