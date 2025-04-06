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

    const formatMenuText = (text: string): string => {
      return text.replace(/\//g, '\n');
    };

    const combinedMenu = {
      breakfast: menu.breakfast ? formatMenuText(menu.breakfast) : '',
      lunch: menu.lunch ? formatMenuText(menu.lunch) : '',
      dinner: menu.dinner ? formatMenuText(menu.dinner) : ''
    };

    if (convenienceMealData) {
      if (convenienceMealData.morning) {
        const morningItems = [
          ...convenienceMealData.morning.sandwich.map(item => `[간편식] ${item}`),
          ...convenienceMealData.morning.salad.map(item => `[간편식] ${item}`),
          ...convenienceMealData.morning.chicken.map(item => `[간편식] ${item}`),
          ...convenienceMealData.morning.grain.map(item => `[간편식] ${item}`),
          ...convenienceMealData.morning.etc.map(item => `[간편식] ${item}`)
        ].filter(Boolean);

        if (morningItems.length > 0) {
          combinedMenu.breakfast = combinedMenu.breakfast
            ? `${combinedMenu.breakfast}\n${morningItems.join('\n')}`
            : morningItems.join('\n');
        }
      }

      if (convenienceMealData.evening) {
        const eveningItems = [
          ...convenienceMealData.evening.sandwich.map(item => `[간편식] ${item}`),
          ...convenienceMealData.evening.salad.map(item => `[간편식] ${item}`),
          ...convenienceMealData.evening.chicken.map(item => `[간편식] ${item}`),
          ...convenienceMealData.evening.grain.map(item => `[간편식] ${item}`),
          ...convenienceMealData.evening.etc.map(item => `[간편식] ${item}`)
        ].filter(Boolean);

        if (eveningItems.length > 0) {
          combinedMenu.dinner = combinedMenu.dinner
            ? `${combinedMenu.dinner}\n${eveningItems.join('\n')}`
            : eveningItems.join('\n');
        }
      }
    }

    const responseData = {
      ...combinedMenu,
      images
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