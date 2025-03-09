import { memoryCache } from '../utils/cache-utils';
import { getLatestMenuDocumentIds, findTargetPost, getMealData } from '../services/cafeteriaService';
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
    const cachedData = memoryCache.get(cacheKey);
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
    const responseData = { ...menu, images };

    memoryCache.set(cacheKey, responseData);

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