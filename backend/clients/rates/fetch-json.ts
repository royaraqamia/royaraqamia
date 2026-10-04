export interface FetchJsonOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 12000;

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch, headers } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}): ${url}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
