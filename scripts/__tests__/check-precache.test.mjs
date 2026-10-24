import { describe, it, expect } from 'vitest';
import { auditPrecacheRoutes, parsePrecacheScript } from '../generate-sw-precache.mjs';
import { errorsFor } from '../check-precache.mjs';

/**
 * The precache audit (#557). Three ways the list can be wrong while the build
 * stays green: a public page nobody notices lost its shell, a declaration that
 * outlived its page, and a cap that dropped routes in silence.
 */

const APP_PATHS = {
  '/page': '/',
  '/privacy/page': '/privacy',
  '/terms/page': '/terms',
  '/news/page': '/news',
  '/feed/page': '/feed',
  '/admin/page': '/admin',
};

const NEVER_CACHE = ['/admin'];

function audit(overrides = {}) {
  const prerendered = Object.keys(APP_PATHS).reduce((acc, key) => {
    const route = APP_PATHS[key];
    if (route === '/news' || route === '/feed') return acc;
    acc[route] = { srcRoute: null };
    return acc;
  }, {});

  return auditPrecacheRoutes({
    appPaths: APP_PATHS,
    prerendered: overrides.prerendered ?? prerendered,
    neverCachePrefixes: NEVER_CACHE,
    dynamicByDesign: overrides.dynamicByDesign ?? [],
    maxRoutes: overrides.maxRoutes,
  });
}

describe('precache audit', () => {
  it('names a public page that is dynamic and undeclared', () => {
    const result = audit();
    expect(result.undeclaredDynamic).toEqual(['/feed', '/news']);
    expect(result.routes).toEqual(['/privacy', '/terms']);
  });

  it('accepts a declared dynamic page and reports the declaration once the page is static', () => {
    const declared = audit({
      dynamicByDesign: [{ route: '/news', reason: 'filters move client-side' }],
    });
    expect(declared.undeclaredDynamic).toEqual(['/feed']);
    expect(declared.staleDeclarations).toEqual([]);

    const stale = audit({
      dynamicByDesign: [{ route: '/privacy', reason: 'was dynamic once' }],
      prerendered: { '/privacy': {}, '/terms': {} },
    });
    expect(stale.staleDeclarations).toEqual(['/privacy']);
  });

  it('reports what the cap dropped instead of hiding it', () => {
    const result = audit({ maxRoutes: 1 });
    expect(result.routes).toEqual(['/privacy']);
    expect(result.total).toBe(2);
    expect(result.truncated).toEqual(['/terms']);
  });

  it('round-trips the rendered script it writes', () => {
    const script = `self.PRECACHE_ROUTES = ["/privacy","/terms"];\n`;
    expect(parsePrecacheScript(script)).toEqual(['/privacy', '/terms']);
    expect(() => parsePrecacheScript('self.OTHER = [];')).toThrow();
  });
});

describe('precache check', () => {
  it('fails with the route named for an undeclared dynamic page', () => {
    const errors = errorsFor({
      result: { ...audit(), routes: [], truncated: [] },
      scriptSource: null,
    });

    expect(errors.some((error) => error.includes('/feed'))).toBe(true);
    expect(errors.some((error) => error.includes('/news'))).toBe(true);
  });

  it('fails when the generated script is not what the build selects', () => {
    const result = audit({ dynamicByDesign: ['/news', '/feed'] });
    const errors = errorsFor({
      result,
      scriptSource: 'self.PRECACHE_ROUTES = ["/privacy"];',
    });
    expect(errors.some((error) => error.includes('stale'))).toBe(true);
  });

  it('passes when the script matches and nothing is undeclared', () => {
    const result = audit({ dynamicByDesign: ['/news', '/feed'] });
    const errors = errorsFor({
      result,
      scriptSource: `self.PRECACHE_ROUTES = ${JSON.stringify(result.routes)};`,
    });
    expect(errors).toEqual([]);
  });
});
