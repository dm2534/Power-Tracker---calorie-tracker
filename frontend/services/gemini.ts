import { GeminiNutritionResponse } from '../types';

const SYSTEM_INSTRUCTION = `You are a precise nutrition analysis AI. Your job is to estimate the caloric and macronutrient content of food from images and/or text descriptions. Be thorough, scientific, and honest about uncertainty. When analyzing images, identify every visible food item and estimate portions using visual cues (plate size, utensils, hands for scale). When only text is given, use standard serving sizes from USDA FoodData Central. Always return a structured JSON response — no prose, no markdown, only raw JSON.`;

export const analyzeFood = async (
  text?: string,
  imageBase64?: string,
  mimeType?: string,
  dietType?: string
): Promise<GeminiNutritionResponse> => {
  const payload: Record<string, string> = {};
  if (text) payload.text = text;
  if (imageBase64) payload.imageBase64 = imageBase64;
  if (mimeType) payload.mimeType = mimeType;
  if (dietType) payload.dietType = dietType;

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Analysis failed: ${errorText}`);
  }

  return response.json();
};

export const sendChatMessage = async (
  messages: { role: string; content: string }[]
): Promise<string> => {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Chat failed: ${errorText}`);
  }

  const data = await response.json();
  return data.reply;
};
