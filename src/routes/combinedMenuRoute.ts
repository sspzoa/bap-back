import { handleCafeteriaRequest } from './cafeteriaRoute';
import { isValidDate } from '../utils/dateUtils';

export async function handleCombinedMenuRequest(dateParam: string) {
  if (!isValidDate(dateParam)) {
    return {
      status: 400,
      body: { error: 'Invalid date format' }
    };
  }

  return await handleCafeteriaRequest(dateParam);
}