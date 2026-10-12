import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

/**
 * The middleware matcher decides whether an edge invocation happens before the
 * cache lookup, which is the whole point of `docs/vercel-usage.md`: a path that
 * slips into the matcher costs an invocation on every request, and a path that
 * slips out of it silently loses the auth redirect and the country cookie.
 *
 * So the table below is asserted against Next's own matcher compiler rather than
 * a hand-rolled `new RegExp(matcher)` guess.
 */
const require = createRequire(import.meta.url);
const { getMiddlewareMatchers } = require('next/dist/build/analysis/get-page-static-info') as {
  getMiddlewareMatchers: (
    matchers: string[],
    config: { basePath: string; trailingSlash: boolean }
  ) => Array<{ regexp: string }>;
};

const proxySource = readFileSync(resolve(process.cwd(), 'proxy.ts'), 'utf8');

function compiledMatchers(): RegExp[] {
  const literal = /matcher:\s*(\[[\s\S]*?\]),?\s*\};/.exec(proxySource);
  if (!literal?.[1]) throw new Error('could not find the `matcher` array in proxy.ts');
  // eslint-disable-next-line no-eval
  const matchers = eval(literal[1]) as string[];
  return getMiddlewareMatchers(matchers, { basePath: '', trailingSlash: false }).map(
    (matcher) => new RegExp(matcher.regexp)
  );
}

/** `true` = the middleware runs for this path. */
const CASES: Array<[pathname: string, runs: boolean]> = [
  // Navigations and API calls: the middleware's actual job.
  ['/', true],
  ['/community', true],
  ['/community/post-5', true],
  ['/terms', true],
  ['/admin', true],
  ['/auth/login', true],
  ['/api/community/search', true],
  ['/api/version', true],
  ['/account', true],
  ['/u/royaraqamia', true],
  ['/verify/COMP-2026-C8F2GBLZ', true],
  // Short-code redirects (and the scanner traffic that looks like them).
  ['/demo123', true],
  ['/wp-admin', true],
  // Assets and frames that need neither an auth decision nor the geo cookie.
  ['/manifest.json', false],
  ['/sw.js', false],
  ['/sw-version.js', false],
  ['/sw-push-config.js', false],
  ['/sw-routing.js', false],
  ['/monitoring', false],
  ['/favicon.ico', false],
  ['/design-system/lib/design-tokens.css', false],
  ['/.well-known/security.txt', false],
  ['/_next/static/chunks/main.js', false],
  ['/_next/image?url=%2Flogo.webp&w=96&q=75', false],
  ['/icons/apple-touch-icon-180x180.png', false],
  ['/logo.webp', false],
  ['/downloader-sample.mp4', false],
];

describe('proxy.ts middleware matcher', () => {
  it('agrees with Next on every path that matters', () => {
    const regexps = compiledMatchers();

    for (const [pathname, runs] of CASES) {
      const actual = regexps.some((regexp) => regexp.test(pathname));
      expect(actual, `${pathname} should ${runs ? 'run' : 'skip'} the middleware`).toBe(runs);
    }
  });
});
