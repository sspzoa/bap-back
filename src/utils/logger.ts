enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL = (process.env.LOG_LEVEL as keyof typeof LogLevel) || 'INFO';
const CURRENT_LEVEL = LogLevel[LOG_LEVEL] || LogLevel.INFO;

function formatMessage(level: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${message}`;
}

export const logger = {
  debug: (message: string, ...args: any[]): void => {
    if (CURRENT_LEVEL <= LogLevel.DEBUG) {
      console.debug(formatMessage('DEBUG', message), ...args);
    }
  },

  info: (message: string, ...args: any[]): void => {
    if (CURRENT_LEVEL <= LogLevel.INFO) {
      console.info(formatMessage('INFO', message), ...args);
    }
  },

  warn: (message: string, ...args: any[]): void => {
    if (CURRENT_LEVEL <= LogLevel.WARN) {
      console.warn(formatMessage('WARN', message), ...args);
    }
  },

  error: (message: string, ...args: any[]): void => {
    if (CURRENT_LEVEL <= LogLevel.ERROR) {
      console.error(formatMessage('ERROR', message), ...args);
    }
  },
};