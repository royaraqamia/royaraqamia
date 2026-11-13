/**
 * Redirect-URI policy for the public MCP OAuth server (ADR 0022, ADR 0179).
 *
 * A registration is not an allowlist of literal strings. A native client — a
 * CLI, a desktop app — binds its callback on a loopback port it picks at run
 * time, and RFC 8252 §7.3 makes that the authorization server's problem: the
 * server "MUST allow any port to be specified at the time of the request for
 * loopback IP redirect URIs". Comparing the registered value to the requested
 * one with `===` therefore rejects the second launch of the same client and
 * every launch after it.
 *
 * Measured on production on 2026-11-13: `opencode mcp auth royaraqamia`
 * registered `http://127.0.0.1:52151/callback`, its next re-authentication
 * asked for `http://127.0.0.1:63881/callback`, and `/mcp/authorize` answered
 * `invalid_request: redirect_uri is not registered for this client` while the
 * client kept re-using the registration it already held.
 *
 * So comparison here is parsed, never textual, and every endpoint reads it from
 * this module: `/mcp/register` (what may be registered), `/mcp/authorize`,
 * `/mcp/connect` and `/mcp/connect/consent` (what a client may be redirected
 * to), and `/mcp/token` (the exchange's same-value rule). `npm run
 * check:redirect-uri` refuses a comparison that does not.
 */

/** Hosts a native client may redirect to over plain http (RFC 8252 §7.3). */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export interface ParsedRedirectUri {
  scheme: 'http' | 'https';
  /** Lowercase, IPv6 brackets stripped (`[::1]` → `::1`). */
  host: string;
  /** Empty for the scheme's default port, as `URL` already normalises it. */
  port: string;
  /** `/` when the URI names no path, so `http://127.0.0.1:9000` matches `…:9000/`. */
  path: string;
  query: string;
  loopback: boolean;
}

/**
 * The URI in the shape the comparisons below read, or `null` when it can never
 * be a redirect target.
 *
 * A fragment is refused rather than ignored: RFC 6749 §3.1.2 says the redirection
 * endpoint URI "MUST NOT include a fragment", and quietly dropping one would let
 * two different registrations compare equal. Credentials in a redirect target
 * are a parser trap with no legitimate use here.
 */
export function parseRedirectUri(uri: string): ParsedRedirectUri | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.hash || url.username || url.password) return null;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return {
    scheme: url.protocol === 'https:' ? 'https' : 'http',
    host,
    port: url.port,
    path: url.pathname || '/',
    query: url.search,
    loopback: LOOPBACK_HOSTS.has(host),
  };
}

/**
 * What a client may register (ADR 0022): https anywhere, plain http only on the
 * machine the client is running on. Non-web schemes (a native app's custom
 * scheme, `javascript:`) are refused at registration, so no later step has to
 * re-litigate them.
 */
export function isValidMcpRedirectUri(uri: string): boolean {
  const parsed = parseRedirectUri(uri);
  if (!parsed) return false;
  return parsed.scheme === 'https' || parsed.loopback;
}

/**
 * Whether a requested `redirect_uri` is the registered one.
 *
 * Same scheme, host, path and query — and the same port, *except* that a
 * loopback registration accepts whatever port the client bound this run
 * (RFC 8252 §7.3). The host still has to match: `localhost` in a registration
 * does not authorise `127.0.0.1`, because the two can resolve differently on the
 * user's machine.
 */
export function isAllowedRedirectUri(registered: string, requested: string): boolean {
  const left = parseRedirectUri(registered);
  const right = parseRedirectUri(requested);
  if (!left || !right) return false;
  if (
    left.scheme !== right.scheme ||
    left.host !== right.host ||
    left.path !== right.path ||
    left.query !== right.query
  ) {
    return false;
  }
  return left.port === right.port || (left.loopback && right.loopback);
}

/** Whether any registration matches the requested redirect target. */
export function allowsRedirectUri(registered: readonly string[], requested: string): boolean {
  return registered.some((uri) => isAllowedRedirectUri(uri, requested));
}

/**
 * Whether two spellings name the same redirect target, port included.
 *
 * This is the token endpoint's rule, not the authorize step's: RFC 6749 §4.1.3
 * requires the exchange's `redirect_uri` to be identical to the one the
 * authorization request carried. Parsing only tolerates two spellings of one
 * value (`https://host` and `https://host/`), so a client cannot present a
 * different port at exchange time than the code was issued for.
 */
export function isSameRedirectUri(left: string, right: string): boolean {
  const a = parseRedirectUri(left);
  const b = parseRedirectUri(right);
  if (!a || !b) return false;
  return (
    a.scheme === b.scheme &&
    a.host === b.host &&
    a.port === b.port &&
    a.path === b.path &&
    a.query === b.query
  );
}
