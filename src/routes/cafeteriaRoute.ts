import { memoryCache } from '../utils/cache-utils';
import { getLatestMenuDocumentIds, findTargetPost, getMealData } from '../services/cafeteriaService';
import { isValidDate } from '../utils/dateUtils';

/**
 * 식단 API 라우트
 * - "/YYYY-MM-DD" 형태의 요청을 처리
 */
export async function handleCafeteriaRequest(dateParam: string) {
  try {
    if (!isValidDate(dateParam)) {
      return {
        status: 400,
        body: { error: 'Invalid date format' }
      };
    }

    // 캐시 체크
    const cacheKey = `cafeteria_${dateParam}`;
    const cachedData = memoryCache.get(cacheKey);
    if (cachedData) {
      return {
        status: 200,
        body: cachedData
      };
    }

    // 문서 목록에서 해당 날짜 식단 post 찾기
    const menuPosts = await getLatestMenuDocumentIds();
    const targetPost = findTargetPost(menuPosts, dateParam);
    if (!targetPost) {
      return {
        status: 404,
        body: { error: 'Menu not found for the specified date' }
      };
    }

    // 식단 텍스트 + 이미지 정보 한 번에 가져오기
    const { menu, images } = await getMealData(targetPost.documentId);
    const responseData = { ...menu, images };

    // 캐시에 저장
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