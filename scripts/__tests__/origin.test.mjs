import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { isScanned, originLines, scan } from '../check-origin.mjs';

const tempDirs = [];

/** A throwaway tree holding `files` as `{ path: contents }`. Returns its root. */
function tree(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'origin-'));
  tempDirs.push(dir);
  for (const [name, contents] of Object.entries(files)) {
    const file = join(dir, name);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, contents);
  }
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('originLines', () => {
  it('reports an origin built from a request URL', () => {
    expect(originLines(`const origin = new URL(req.url).origin;`)).toEqual([
      {
        line: 1,
        text: 'const origin = new URL(req.url).origin;',
        why: 'builds an origin from the request URL (use env.origin)',
      },
    ]);
    expect(originLines(`new URL(request.url).origin`)).toHaveLength(1);
    expect(originLines(`new URL( request.nextUrl ).origin`)).toHaveLength(1);
  });

  it('reports a Host header read', () => {
    expect(originLines(`request.headers.get('host')`)).toHaveLength(1);
    expect(originLines(`request.headers.get("x-forwarded-host")`)).toHaveLength(1);
  });

  it('accepts the configured origin and a relative base', () => {
    expect(originLines(`const base = env.origin;`)).toEqual([]);
    expect(originLines(`new URL('/mcp/callback', env.origin).toString()`)).toEqual([]);
    expect(originLines(`new URL(target, request.url)`)).toEqual([]);
    expect(originLines(`request.nextUrl.clone()`)).toEqual([]);
  });

  it('lets a comment name the pattern it forbids', () => {
    expect(originLines('// never new URL(req.url).origin')).toEqual([]);
    expect(originLines(' * `new URL(req.url).origin` is the bug')).toEqual([]);
    expect(originLines('/* header x-forwarded-host */')).toEqual([]);
  });

  it('reports 1-based line numbers, and only for the offending lines', () => {
    const text = ['ok', 'new URL(req.url).origin', 'ok', '.nextUrl.origin'].join('\n');
    expect(originLines(text).map(({ line }) => line)).toEqual([2, 4]);
  });
});

describe('isScanned', () => {
  it('covers server code and skips tests, generated files and docs', () => {
    expect(isScanned('app/[code]/route.ts')).toBe(true);
    expect(isScanned('backend/middleware/mcp-auth.ts')).toBe(true);
    expect(isScanned('proxy.ts')).toBe(true);
    expect(isScanned('app/[code]/__tests__/route.test.ts')).toBe(false);
    expect(isScanned('backend/config/generated/app-version.ts')).toBe(false);
    expect(isScanned('docs/architecture.md')).toBe(false);
    expect(isScanned('android/app/build.gradle')).toBe(false);
  });
});

describe('scan', () => {
  it('reports the offending files with their line numbers', () => {
    const dir = tree({
      'app/page.tsx': `ok\nconst o = new URL(req.url).origin;\n`,
      'backend/x.ts': `headers.get('host')\n`,
      'app/clean.ts': `env.origin\n`,
    });

    const found = scan(['app/page.tsx', 'backend/x.ts', 'app/clean.ts'], dir);

    expect(found.map(({ file }) => file)).toEqual(['app/page.tsx', 'backend/x.ts']);
    expect(found[0].lines[0].line).toBe(2);
  });

  it('ignores excluded files and files that are gone', () => {
    const dir = tree({
      'app/__tests__/route.test.ts': `new URL(req.url).origin\n`,
    });

    expect(scan(['app/__tests__/route.test.ts', 'gone.ts'], dir)).toEqual([]);
  });
});
