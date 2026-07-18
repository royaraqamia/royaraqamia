export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return 'حدث خطأ غير متوقع.';
}

export function getErrorStatusCode(err: unknown): number {
  if (err instanceof AppError) return err.statusCode;
  return 500;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string | undefined;

  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}
