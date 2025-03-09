// src/utils/dateUtils.ts
export function formatDate(date: Date): string {
  try {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
}

export function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

export function getKSTDate(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 9 * 60 * 60 * 1000);
}

export function getKSTTimestamp(): number {
  return getKSTDate().getTime();
}
