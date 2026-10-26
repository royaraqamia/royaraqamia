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

/**
 * Whether a response forbids keeping a copy of what it carried (#555).
 *
 * This is the hard redaction rule of the public snapshot store, read where the
 * response exists rather than where the snapshot is written: `no-store` is the
 * server saying "this answer is for this request only", and `private` says the
 * same about an intermediary —?" either is enough to keep the rows out of
 * `localStorage`. An absent header is not permission for a *cache*, but it is not
 * a prohibition either, and every public read API this store serves is a
 * `public`/`no-store` GET by contract (`scripts/__tests__/api-cache-contract.test.ts`).
 */
export function isResponseKeepable(response: Response): boolean {
  const headers = response.headers;
  // A response with no header bag states no prohibition; the guard is there for
  // the seam itself (a stubbed response in a test), not for a browser.
  if (!headers || typeof headers.get !== 'function') return true;

  const cacheControl = (headers.get('cache-control') ?? '').toLowerCase();
  const pragma = (headers.get('pragma') ?? '').toLowerCase();
  if (cacheControl.includes('no-store') || cacheControl.includes('private')) return false;
  return !pragma.includes('no-cache');
}

/** A response's body and what may be done with a copy of it. */
export interface RequestResult<T> {
  data: T;
  /** False when the response forbade keeping it, so nothing may be recorded. */
  keepable: boolean;
}

/**
 * `request`, plus the one fact a snapshot writer needs: whether the response is
 * allowed to leave a copy behind.
 *
 * The rows a public surface records are the ones it rendered (see the snapshot
 * store); this is the other half of the redaction rule, so a surface that reads
 * through this seam cannot write an answer the server marked `no-store`.
 */
export async function requestWithMeta<T>(
  url: string,
  options: RequestInit = {}
): Promise<RequestResult<T>> {
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

  return { data: data as T, keepable: isResponseKeepable(res) };
}

export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  return (await requestWithMeta<T>(url, options)).data;
}
