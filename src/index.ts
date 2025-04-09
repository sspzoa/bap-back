import { createServer } from './server';
import { logger } from './utils/logger';
import { CONFIG } from './config';

const server = createServer();

logger.info(`Server running at http://${CONFIG.SERVER.HOST}:${CONFIG.SERVER.PORT}`);

export { server };