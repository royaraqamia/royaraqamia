/**
 * The site's one public origin — the only place an absolute URL may start from
 * (ADR-0178).
 *
 * A self-hosted Next server does not know its own public address: `next start`
 * builds `request.url` from the hostname and port it listens on, so behind
 * Render (ADR-0174) every `new URL(request.url).origin` is
 * `https://localhost:10000`. That is not a theory — it is what the MCP
 * discovery documents advertised, and what took `opencode mcp auth` down long
 * after the host move, with every unit test still green.
 *
 * Configuration is the answer, and it is also the specification's answer: RFC
 * 8414 and RFC 9728 want an issuer and a resource that do not change with the
 * request that asks for them. A request-derived issuer is a token-audience bug
 * waiting to be written, and a `Host`-derived one is a poisoning vector.
 *
 * Precedence, highest first:
 *
 *   - `PUBLIC_ORIGIN` — the runtime knob. A preview, or an image promoted
 *     between environments, is then a variable rather than a rebuild.
 *   - `NEXT_PUBLIC_SITE_URL` — the value the browser inlines at build time, so a
 *     deployment that only has this one is still correct.
 *   - `NEXT_PUBLIC_BASE_URL` — the pre-ADR-0178 spelling, kept so an existing
 *     environment file is not a breaking change.
 *
 * Development falls back to `http://localhost:3000`; production does not fall
 * back at all. An unset origin throws on the first read, because the constant
 * fallback this replaces is exactly what let a wrong origin survive a host
 * migration: it never failed, it only pointed somewhere else.
 */

export const DEV_ORIGIN = 'http://localhost:3000';

/**
 * The bare origin in `raw`, or null when `raw` is not one.
 *
 * A path, query or fragment is refused rather than trimmed: `PUBLIC_ORIGIN` is
 * concatenated with `/mcp`, `/mcp/token` and friends, and `https://host/foo`
 * would silently produce `https://host/foo/mcp` — an address that resolves, to
 * the wrong document.
 */
export function normalizeOrigin(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') return null;

  return url.origin;
}

/** The environment keys this module reads. Injected in tests; `process.env` in production. */
export interface OriginSource {
  PUBLIC_ORIGIN?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  NEXT_PUBLIC_BASE_URL?: string;
  NODE_ENV?: string;
}

/**
 * The configured origin.
 *
 * Throws — in production, and on a malformed value anywhere — rather than
 * guessing. A wrong origin that only logs is the failure this module exists to
 * end: every absolute URL it feeds is a document another server has to be able
 * to fetch.
 */
export function resolveOrigin(source: OriginSource = process.env): string {
  const configured = [
    source.PUBLIC_ORIGIN,
    source.NEXT_PUBLIC_SITE_URL,
    source.NEXT_PUBLIC_BASE_URL,
  ].find((value) => value?.trim());

  const origin = normalizeOrigin(configured);

  if (!origin) {
    if (configured?.trim()) {
      throw new Error(
        `PUBLIC_ORIGIN must be a bare http(s) origin such as https://royaraqamia.com, got "${configured.trim()}" (ADR-0178).`
      );
    }
    if (source.NODE_ENV === 'production') {
      throw new Error(
        'PUBLIC_ORIGIN is unset in production: absolute URLs are built from it, never from the request (ADR-0178).'
      );
    }
    return DEV_ORIGIN;
  }

  // Two spellings, one truth. A `PUBLIC_ORIGIN` that disagrees with the value
  // the browser inlined makes a deployment whose links and whose own pages name
  // different hosts, and the symptom surfaces far from the cause: an email that
  // points at a preview, an OAuth redirect that leaves the session behind.
  const inlined = normalizeOrigin(source.NEXT_PUBLIC_SITE_URL);
  if (inlined && inlined !== origin && source.PUBLIC_ORIGIN?.trim()) {
    throw new Error(
      `PUBLIC_ORIGIN (${origin}) disagrees with NEXT_PUBLIC_SITE_URL (${inlined}); they must name the same origin (ADR-0178).`
    );
  }

  return origin;
}
