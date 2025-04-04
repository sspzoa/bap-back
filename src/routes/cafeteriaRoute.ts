import { sqliteCache } from '../utils/sqlite-cache';
import { getLatestMenuDocumentIds, findTargetPost, getMealData } from '../services/cafeteriaService';
import { getConvenienceMealData } from '../services/convenienceService';
import { isValidDate } from '../utils/dateUtils';

export async function handleCafeteriaRequest(dateParam: string) {
  try {
    if (!isValidDate(dateParam)) {
      return {
        status: 400,
        body: { error: 'Invalid date format' }
      };
    }

    const cacheKey = `cafeteria_${dateParam}`;
    const cachedData = sqliteCache.get(cacheKey);
    if (cachedData) {
      return {
        status: 200,
        body: cachedData
      };
    }

    const menuPosts = await getLatestMenuDocumentIds();
    const targetPost = findTargetPost(menuPosts, dateParam);
    if (!targetPost) {
      return {
        status: 404,
        body: { error: 'Menu not found for the specified date' }
      };
    }

    const { menu, images } = await getMealData(targetPost.documentId);

    const convenienceMealData = await getConvenienceMealData(dateParam);

    const responseData = {
      ...menu,
      images,
      convenience: convenienceMealData ? {
        morning: convenienceMealData.morning,
        evening: convenienceMealData.evening
      } : null
    };

    sqliteCache.set(cacheKey, responseData);

    return {
      status: 200,
      body: responseData
    };
  } catch (error) {
    console.error('Server error:', error);
    return {
      status: 500,
      body: { error: 'Internal server error' }
    };
  }
}