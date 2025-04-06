import { sqliteCache } from '../utils/sqlite-cache';
import { getLatestMenuDocumentIds, findTargetPost, getMealData } from '../services/cafeteriaService';
import type {getConvenienceMealData, ConvenienceMealData} from '../services/convenienceService';
import { isValidDate } from '../utils/dateUtils';
import type {MealImages} from '../types';

interface CafeteriaMenu {
  breakfast: string;
  lunch: string;
  dinner: string;
  images: MealImages;
}

export async function handleCafeteriaRequest(dateParam: string) {
  try {
    if (!isValidDate(dateParam)) {
      return {
        status: 400,
        body: { error: 'Invalid date format' }
      };
    }

    const cafeteriaCacheKey = `cafeteria_${dateParam}`;
    const convenienceCacheKey = `convenience_${dateParam}`;
    const combinedCacheKey = `combined_menu_${dateParam}`;

    const cachedCombined = sqliteCache.get<CafeteriaMenu>(combinedCacheKey);
    if (cachedCombined) {
      return {
        status: 200,
        body: cachedCombined
      };
    }

    let cafeteriaData: CafeteriaMenu;
    const cachedCafeteria = sqliteCache.get<CafeteriaMenu>(cafeteriaCacheKey);

    if (cachedCafeteria) {
      cafeteriaData = cachedCafeteria;
    } else {
      const menuPosts = await getLatestMenuDocumentIds();
      const targetPost = findTargetPost(menuPosts, dateParam);
      if (!targetPost) {
        return {
          status: 404,
          body: { error: 'Menu not found for the specified date' }
        };
      }

      const { menu, images } = await getMealData(targetPost.documentId);

      const formatMenuText = (text: string): string => {
        return text.replace(/\//g, '\n');
      };

      cafeteriaData = {
        breakfast: menu.breakfast ? formatMenuText(menu.breakfast) : '',
        lunch: menu.lunch ? formatMenuText(menu.lunch) : '',
        dinner: menu.dinner ? formatMenuText(menu.dinner) : '',
        images
      };

      sqliteCache.set(cafeteriaCacheKey, cafeteriaData);
    }

    let convenienceData: ConvenienceMealData | null = null;
    const cachedConvenience = sqliteCache.get<ConvenienceMealData>(convenienceCacheKey);

    if (cachedConvenience) {
      convenienceData = cachedConvenience;
    }

    const combinedMenu: CafeteriaMenu = {
      breakfast: cafeteriaData.breakfast || '',
      lunch: cafeteriaData.lunch || '',
      dinner: cafeteriaData.dinner || '',
      images: cafeteriaData.images
    };

    if (convenienceData) {
      if (convenienceData.morning) {
        const morningItems = [
          ...(convenienceData.morning.sandwich || []).map(item => `[간편식] ${item}`),
          ...(convenienceData.morning.salad || []).map(item => `[간편식] ${item}`),
          ...(convenienceData.morning.chicken || []).map(item => `[간편식] ${item}`),
          ...(convenienceData.morning.grain || []).map(item => `[간편식] ${item}`),
          ...(convenienceData.morning.etc || []).map(item => `[간편식] ${item}`)
        ].filter(Boolean);

        if (morningItems.length > 0) {
          combinedMenu.breakfast = combinedMenu.breakfast
            ? `${combinedMenu.breakfast}\n${morningItems.join('\n')}`
            : morningItems.join('\n');
        }
      }

      if (convenienceData.evening) {
        const eveningItems = [
          ...(convenienceData.evening.sandwich || []).map(item => `[간편식] ${item}`),
          ...(convenienceData.evening.salad || []).map(item => `[간편식] ${item}`),
          ...(convenienceData.evening.chicken || []).map(item => `[간편식] ${item}`),
          ...(convenienceData.evening.grain || []).map(item => `[간편식] ${item}`),
          ...(convenienceData.evening.etc || []).map(item => `[간편식] ${item}`)
        ].filter(Boolean);

        if (eveningItems.length > 0) {
          combinedMenu.dinner = combinedMenu.dinner
            ? `${combinedMenu.dinner}\n${eveningItems.join('\n')}`
            : eveningItems.join('\n');
        }
      }
    }

    sqliteCache.set(combinedCacheKey, combinedMenu);

    return {
      status: 200,
      body: combinedMenu
    };
  } catch (error) {
    console.error('Server error:', error);
    return {
      status: 500,
      body: { error: 'Internal server error' }
    };
  }
}