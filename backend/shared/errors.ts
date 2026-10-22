const GENERIC_ERROR_MESSAGE = 'حدث خطأ غير متوقع.';

export function getErrorMessage(err: unknown): string {
  const message = rawMessage(err);
  // An empty message is not a message. PostgREST answers some requests with a
  // body supabase-js cannot read, which becomes `{ message: '' }`; passing that
  // through showed the user an empty error and hid the cause (#518's LinkSnap
  // 500). Fall back so the surface always has something to say.
  return message.trim() ? message : GENERIC_ERROR_MESSAGE;
}

function rawMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return '';
}

/**
 * The error in a form a log line can keep.
 *
 * `String(err)` prints `[object Object]` for the plain objects supabase-js
 * throws (PostgREST errors are one), which threw away the very field that names
 * the fault. This keeps Error's name and message, and serializes the object
 * shape when it is not an Error.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === 'object' && err !== null) {
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}
