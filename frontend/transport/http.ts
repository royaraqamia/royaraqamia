/**
 * The reader-facing words for the two failures the browser can hand us without
 * the backend writing anything: a request that never left, and a response whose
 * body carried no message. Surfaced through `err.message`, so both are Arabic
 * and neither leaks a browser string or a status code (#402).
 */
const NETWORK_ERROR_MESSAGE = 'تعذّر الاتصال بالخادم. تحقّق من اتصالك ثم أعد المحاولة.';
const REQUEST_ERROR_MESSAGE = 'تعذّر إتمام الطلب. أعد المحاولة.';

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'ApiError';
  }

  /**
   * True when `fetch` itself rejected, so the request never reached the server.
   * Distinguishes "we could not ask" from "the server answered with an error",
   * which is the difference ADR-0031 surfaces need to name (#402).
   */
  get isNetworkError(): boolean {
    return this.status === undefined;
  }
}

function serverMessage(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const { error, message } = data as { error?: unknown; message?: unknown };
  if (typeof error === 'string' && error.trim() !== '') return error;
  if (typeof message === 'string' && message.trim() !== '') return message;
  return undefined;
}

export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (cause) {
    throw new ApiError(NETWORK_ERROR_MESSAGE, undefined, { cause });
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data?.success === false) {
    const message = serverMessage(data) ?? REQUEST_ERROR_MESSAGE;
    throw new ApiError(message, res.status);
  }

  return data as T;
}
