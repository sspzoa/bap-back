import { CONFIG } from './config';
import { createServer } from './server';
import { logger } from './utils/logger';

const server = createServer();

logger.info(`Server running at http://${CONFIG.SERVER.HOST}:${CONFIG.SERVER.PORT}`);

export { server };