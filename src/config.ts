/**
 * 프로젝트 공통 설정값을 관리하는 파일
 */
export const CONFIG = {
  BASE_URL: 'https://www.dimigo.hs.kr/index.php',
  CAFETERIA_PATH: 'school_cafeteria',
  MEAL_TYPES: {
    BREAKFAST: '조식',
    LUNCH: '중식',
    DINNER: '석식'
  },
  TIMEOUT: 5000, // fetch timeout
  PORT: 3000     // Bun server port
} as const;
