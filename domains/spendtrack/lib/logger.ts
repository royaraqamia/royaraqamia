const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const logger = {
  error: (context: string, message: string, ...args: unknown[]) => {
    if (IS_PRODUCTION) {
      console.error(
        JSON.stringify({ level: 'error', context, message, timestamp: new Date().toISOString() })
      );
    } else {
      console.error(`[${context}] ${message}`, ...args);
    }
  },
  warn: (context: string, message: string, ...args: unknown[]) => {
    if (IS_PRODUCTION) {
      console.warn(
        JSON.stringify({ level: 'warn', context, message, timestamp: new Date().toISOString() })
      );
    } else {
      console.warn(`[${context}] ${message}`, ...args);
    }
  },
};
