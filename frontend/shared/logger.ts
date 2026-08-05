type LogLevel = 'error' | 'warn' | 'info';

interface Logger {
  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
}

function formatMessage(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): string {
  const prefix = `[${level.toUpperCase()}]`;
  if (!context) return `${prefix} ${message}`;
  return `${prefix} ${message} ${JSON.stringify(context)}`;
}

export const logger: Logger = {
  error(message, context) {
    console.error(formatMessage('error', message, context));
  },
  warn(message, context) {
    console.warn(formatMessage('warn', message, context));
  },
  info(message, context) {
    console.info(formatMessage('info', message, context));
  },
};