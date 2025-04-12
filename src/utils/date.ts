import { logger } from './logger';

export function formatDate(date: Date): string {
  try {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch (error) {
    logger.error('Error formatting date:', error);
    return '';
  }
}

export function isValidDate(dateString: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return false;
  }

  const date = new Date(dateString);
  return !Number.isNaN(date.getTime());
}

export function getKSTDate(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 9 * 60 * 60 * 1000);
}

export function getKSTTimestamp(): number {
  return getKSTDate().getTime();
}

export function parseKoreanDate(text: string, previousDates?: Date[]): Date | null {
  const match = text.match(/(\d+)월\s*(\d+)일/);
  if (!match) return null;

  const [, monthStr, dayStr] = match;
  const month = Number.parseInt(monthStr);
  const day = Number.parseInt(dayStr);

  const currentDate = getKSTDate();
  const currentYear = currentDate.getFullYear();

  let year = currentYear;

  if (previousDates && previousDates.length > 0) {
    const latestDate = previousDates[0];
    const latestMonth = latestDate.getMonth() + 1;

    if (month < latestMonth && latestMonth - month > 6) {
      year = latestDate.getFullYear() + 1;
    } else if (month > latestMonth && month - latestMonth > 6) {
      year = latestDate.getFullYear() - 1;
    } else {
      year = latestDate.getFullYear();
    }
  }

  return new Date(year, month - 1, day);
}
