import { CONFIG } from './config';
import { createServer } from './server';
import { logger } from './utils/logger';

const server = createServer();

logger.info('서버 시작', {
  module: 'main',
  host: CONFIG.SERVER.HOST,
  port: CONFIG.SERVER.PORT,
  url: `http://${CONFIG.SERVER.HOST}:${CONFIG.SERVER.PORT}`,
});

export { server };
