import { corsHeaders } from '../middleware/cors';
import { ApiError } from '../middleware/error';
import { getCafeteriaData, saveCafeteriaData, deleteCafeteriaData } from '../services/cafeteria';
import { cache } from '../utils/cache';
import { isValidDate } from '../utils/date';
import type { CafeteriaResponse } from '../types';

export async function handleHealthCheck(): Promise<Response> {
  const healthData = {
    status: 'ok',
    cacheStatus: {
      entries: cache.count(),
    },
  };

  return new Response(JSON.stringify(healthData), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export async function handleClearCache(): Promise<Response> {
  cache.clear();

  return new Response(JSON.stringify({ success: true, message: 'Cache cleared successfully' }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export async function handleCafeteriaRequest(dateParam: string): Promise<Response> {
  if (!isValidDate(dateParam)) {
    throw new ApiError(400, 'Invalid date format');
  }

  const data = await getCafeteriaData(dateParam);

  if (!data) {
    throw new ApiError(404, '급식 정보가 없어요');
  }

  return new Response(JSON.stringify(data), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export async function handleCafeteriaCreate(dateParam: string, req: Request): Promise<Response> {
  if (!isValidDate(dateParam)) {
    throw new ApiError(400, 'Invalid date format');
  }

  let body: any;
  const contentType = req.headers.get('content-type');

  try {
    if (contentType?.includes('application/json')) {
      body = await req.json();
    } else if (contentType?.includes('text/plain')) {
      const text = await req.text();
      body = parseCafeteriaText(text);
    } else {
      throw new ApiError(400, 'Content-Type must be application/json or text/plain');
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'Invalid request body');
  }

  // Validate the data structure
  if (!validateCafeteriaData(body)) {
    throw new ApiError(400, 'Invalid cafeteria data structure');
  }

  await saveCafeteriaData(dateParam, body);

  return new Response(JSON.stringify({
    success: true,
    message: `Successfully saved cafeteria data for ${dateParam}`,
    data: body
  }), {
    status: 201,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export async function handleCafeteriaDelete(dateParam: string): Promise<Response> {
  if (!isValidDate(dateParam)) {
    throw new ApiError(400, 'Invalid date format');
  }

  const deleted = await deleteCafeteriaData(dateParam);

  if (!deleted) {
    throw new ApiError(404, 'No cafeteria data found for this date');
  }

  return new Response(JSON.stringify({
    success: true,
    message: `Successfully deleted cafeteria data for ${dateParam}`
  }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function validateCafeteriaData(data: any): data is CafeteriaResponse {
  if (!data || typeof data !== 'object') return false;

  const meals = ['breakfast', 'lunch', 'dinner'];

  for (const meal of meals) {
    if (!data[meal] || typeof data[meal] !== 'object') return false;

    const mealData = data[meal];

    if (!Array.isArray(mealData.regular)) return false;
    if (!Array.isArray(mealData.simple)) return false;

    // Validate that menu items are strings
    if (!mealData.regular.every((item: any) => typeof item === 'string')) return false;
    if (!mealData.simple.every((item: any) => typeof item === 'string')) return false;
  }

  return true;
}

function parseCafeteriaText(text: string): CafeteriaResponse {
  const result: CafeteriaResponse = {
    breakfast: { regular: [], simple: [] },
    lunch: { regular: [], simple: [] },
    dinner: { regular: [], simple: [] },
  };

  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);

  let currentMeal: 'breakfast' | 'lunch' | 'dinner' | null = null;
  let isSimpleMenu = false;

  for (const line of lines) {
    // 식사 타입 감지
    if (line.startsWith('*조식:')) {
      currentMeal = 'breakfast';
      isSimpleMenu = false;
      const menuText = line.replace('*조식:', '').trim();
      if (menuText) {
        result.breakfast.regular = parseMenuItems(menuText);
      }
    } else if (line.startsWith('*중식:')) {
      currentMeal = 'lunch';
      isSimpleMenu = false;
      const menuText = line.replace('*중식:', '').trim();
      if (menuText) {
        result.lunch.regular = parseMenuItems(menuText);
      }
    } else if (line.startsWith('*석식:')) {
      currentMeal = 'dinner';
      isSimpleMenu = false;
      const menuText = line.replace('*석식:', '').trim();
      if (menuText) {
        result.dinner.regular = parseMenuItems(menuText);
      }
    } else if (line.startsWith('<간편식>')) {
      isSimpleMenu = true;
      const menuText = line.replace('<간편식>', '').trim();
      if (menuText && currentMeal) {
        result[currentMeal].simple = parseMenuItems(menuText);
      }
    } else if (currentMeal) {
      // 이어지는 메뉴 라인 처리
      if (isSimpleMenu) {
        result[currentMeal].simple = [...result[currentMeal].simple, ...parseMenuItems(line)];
      } else {
        result[currentMeal].regular = [...result[currentMeal].regular, ...parseMenuItems(line)];
      }
    }
  }

  return result;
}

function parseMenuItems(menuText: string): string[] {
  return menuText
    .split('/')
    .map(item => item.trim())
    .filter(Boolean);
}