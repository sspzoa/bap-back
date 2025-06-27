import { fetchAndSaveCafeteriaData, getLatestMenuPosts } from '../services/cafeteria';
import { formatDate, getKSTDate, parseKoreanDate } from '../utils/date';
import { closeBrowser } from '../utils/fetch';
import { logger } from '../utils/logger';

export async function refreshCafeteriaData(): Promise<void> {
  logger.info('식단 데이터 갱신 시작', { module: 'refresh-job' });

  try {
    const menuPosts = await getLatestMenuPosts();

    for (const post of menuPosts) {
      try {
        const postDate = parseKoreanDate(post.title);
        if (!postDate) {
          logger.warn('날짜 파싱 실패', { module: 'refresh-job', title: post.title });
          continue;
        }

        const dateKey = formatDate(postDate);
        await fetchAndSaveCafeteriaData(dateKey, menuPosts);
      } catch (error) {
        logger.error('메뉴 가져오기 실패', error, {
          module: 'refresh-job',
          title: post.title,
        });
      }
    }

    logger.info('식단 데이터 갱신 완료', { module: 'refresh-job' });
  } catch (error) {
    logger.error('식단 데이터 갱신 실패', error, { module: 'refresh-job' });
    throw error;
  } finally {
    await closeBrowser();
  }
}

function getNextRunTime(): number {
  const now = getKSTDate();
  const next = new Date(now);

  const targetDay = 6;
  const targetHour = 3;

  next.setHours(targetHour, 0, 0, 0);

  const currentDay = now.getDay();
  const daysUntilSaturday = (targetDay - currentDay + 7) % 7;

  if (currentDay === targetDay && now.getHours() < targetHour) {
  } else {
    if (daysUntilSaturday === 0) {
      next.setDate(next.getDate() + 7);
    } else {
      next.setDate(next.getDate() + daysUntilSaturday);
    }
  }

  return next.getTime() - now.getTime();
}

function scheduleNextRun(): NodeJS.Timeout {
  const timeUntilNext = getNextRunTime();
  const nextRunKST = new Date(getKSTDate().getTime() + timeUntilNext);

  logger.info('다음 갱신 예정', {
    module: 'refresh-job',
    nextRun: nextRunKST.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
  });

  return <NodeJS.Timeout>setTimeout(() => {
    refreshCafeteriaData()
      .then(() => {
        logger.info('정기 갱신 성공', { module: 'refresh-job' });
      })
      .catch((error) => {
        logger.error('정기 갱신 실패', error, { module: 'refresh-job' });
      })
      .finally(() => {
        scheduleNextRun();
      });
  }, timeUntilNext);
}

export function setupRefreshJob(): NodeJS.Timeout | null {
  logger.info('갱신 작업 설정 (매주 토요일 오전 3시)', { module: 'refresh-job' });

  refreshCafeteriaData().catch((error) => {
    logger.error('초기 갱신 실패', error, { module: 'refresh-job' });
  });

  return scheduleNextRun();
}
