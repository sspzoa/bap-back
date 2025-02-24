/**
 * 날짜 관련 유틸 함수 모음
 */

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

/**
 * 날짜 유효성 검사
 * @param dateString - 'YYYY-MM-DD' 형태
 */
export function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * KST(한국 표준시) 기준 Date 객체 반환
 */
export function getKSTDate(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 9 * 60 * 60 * 1000);
}

/**
 * KST(한국 표준시) 기준 타임스탬프(ms) 반환
 */
export function getKSTTimestamp(): number {
  return getKSTDate().getTime();
}
