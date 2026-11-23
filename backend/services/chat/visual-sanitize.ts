/**
 * The one gate every model-written SVG passes through (ADR-0215).
 *
 * A visual is data the member asked to see, not code this deployment runs.
 * No script, no foreign content, no external reference and no event handler may
 * survive. What leaves here is a static drawing a browser can paint into a
 * canvas and nothing more.
 */
const FORBIDDEN_TAGS =
  /<\s*\/?\s*(script|foreignObject|iframe|object|embed|link|meta|animate|animateTransform|set|handler)\b[^>]*>/gi;
const EVENT_HANDLERS = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const HREF = /\b(?:xlink:)?href\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const REMOTE_URL = /\burl\s*\(\s*['"]?(?:https?:|\/\/)[^)]*['"]?\s*\)/gi;

/** Returns null for anything that is not a static SVG drawing. */
export function sanitizeVisualSvg(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('<svg') || !trimmed.endsWith('</svg>')) return null;

  const clean = trimmed
    .replace(FORBIDDEN_TAGS, '')
    .replace(EVENT_HANDLERS, '')
    .replace(HREF, '')
    .replace(REMOTE_URL, '');

  // A tag that survived as a prefix of a longer name (e.g. `onload` without a
  // value) must not reach the page either.
  if (/\son[a-z]+\s*=/i.test(clean) || /\b(?:xlink:)?href\s*=/i.test(clean)) return null;
  if (!clean.startsWith('<svg') || !clean.endsWith('</svg>')) return null;
  return clean;
}
