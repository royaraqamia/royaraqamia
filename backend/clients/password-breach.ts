import { createHash } from 'crypto';

/**
 * Checks a password against the HaveIBeenPwned "Pwned Passwords" range API —
 * the same dataset Supabase's Pro-only leaked-password protection uses, but
 * free and keyless.
 *
 * k-anonymity: only the first 5 hex chars of the password's SHA-1 ever leave
 * this process. The API returns every suffix sharing that prefix (plus the
 * breach counts), and the match is done locally.
 *
 * Fails open on any error/timeout: this is a defense-in-depth check, not the
 * only control, so a HIBP outage must never block signup or a password change.
 */
export interface PasswordBreachChecker {
  isBreached(password: string): Promise<boolean>;
}

export interface PasswordBreachCheckerOptions {
  enabled?: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range';
const DEFAULT_TIMEOUT_MS = 2500;
const DEFAULT_USER_AGENT = 'royaraqamia-auth';
const MAX_CACHE_ENTRIES = 512;

/** Uppercase SHA-1 hex, the format the HIBP range API uses. */
export function sha1HexUpper(value: string): string {
  return createHash('sha1').update(value, 'utf8').digest('hex').toUpperCase();
}

function parseRange(body: string): Set<string> {
  const suffixes = new Set<string>();
  for (const line of body.split(/\r?\n/)) {
    const [rawSuffix, rawCount] = line.split(':');
    const suffix = rawSuffix?.trim().toUpperCase();
    if (!suffix) continue;
    // `Add-Padding` responses include fake entries with count 0; ignore them.
    if (rawCount !== undefined && Number(rawCount) === 0) continue;
    suffixes.add(suffix);
  }
  return suffixes;
}

export function createPasswordBreachChecker(
  options: PasswordBreachCheckerOptions = {}
): PasswordBreachChecker {
  const enabled = options.enabled ?? true;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  // Range responses are pure functions of the 5-char prefix; cache them so a
  // burst of similar passwords does not each hit the network. Bounded so a
  // flood cannot grow the map without limit.
  const rangeCache = new Map<string, Set<string>>();

  async function loadRange(prefix: string): Promise<Set<string> | null> {
    const cached = rangeCache.get(prefix);
    if (cached) return cached;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${HIBP_RANGE_URL}/${prefix}`, {
        headers: { 'Add-Padding': 'true', 'User-Agent': userAgent },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const suffixes = parseRange(await response.text());
      if (rangeCache.size >= MAX_CACHE_ENTRIES) {
        const oldest = rangeCache.keys().next().value;
        if (oldest !== undefined) rangeCache.delete(oldest);
      }
      rangeCache.set(prefix, suffixes);
      return suffixes;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async isBreached(password: string): Promise<boolean> {
      if (!enabled || password.length === 0) return false;
      const hash = sha1HexUpper(password);
      const suffix = hash.slice(5);
      const suffixes = await loadRange(hash.slice(0, 5));
      if (!suffixes) return false;
      return suffixes.has(suffix);
    },
  };
}
