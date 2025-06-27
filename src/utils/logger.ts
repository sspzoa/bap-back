enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL = (process.env.LOG_LEVEL as keyof typeof LogLevel) || 'INFO';
const CURRENT_LEVEL = LogLevel[LOG_LEVEL] || LogLevel.INFO;

type LogContext = {
  module?: string;
  action?: string;
  date?: string;
  documentId?: string;
  [key: string]: any;
};

function formatMessage(level: string, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const contextStr = context
    ? ` [${Object.entries(context)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ')}]`
    : '';
  return `[${timestamp}] [${level}]${contextStr} ${message}`;
}

export const logger = {
  debug: (message: string, context?: LogContext): void => {
    if (CURRENT_LEVEL <= LogLevel.DEBUG) {
      console.debug(formatMessage('DEBUG', message, context));
    }
  },

  info: (message: string, context?: LogContext): void => {
    if (CURRENT_LEVEL <= LogLevel.INFO) {
      console.info(formatMessage('INFO', message, context));
    }
  },

  warn: (message: string, error: unknown, context?: LogContext): void => {
    if (CURRENT_LEVEL <= LogLevel.WARN) {
      console.warn(formatMessage('WARN', message, context));
    }
  },

  error: (message: string, error?: unknown, context?: LogContext): void => {
    if (CURRENT_LEVEL <= LogLevel.ERROR) {
      console.error(formatMessage('ERROR', message, context));
      if (error) {
        console.error(error);
      }
    }
  },
};
