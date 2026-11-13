import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { MODULE, isScanned, redirectUriLines, scan } from '../check-redirect-uri.mjs';

const tempDirs = [];

/** A throwaway tree holding `files` as `{ path: contents }`. Returns its root. */
function tree(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'redirect-uri-'));
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

describe('redirectUriLines', () => {
  it('reports a registration compared to a target as text', () => {
    expect(redirectUriLines(`client.redirect_uris.includes(redirectUri)`)).toEqual([
      {
        line: 1,
        text: 'client.redirect_uris.includes(redirectUri)',
        why: 'compares a registration to a redirect target as text (use allowsRedirectUri)',
      },
    ]);
    expect(redirectUriLines(`const ok = client.redirect_uris . includes (uri);`)).toHaveLength(1);
  });

  it('reports a loose redirect target compared with includes', () => {
    expect(redirectUriLines(`if (allowed.includes(redirectUri)) return true;`)).toHaveLength(1);
  });

  it('reports an identity comparison of redirect_uri values', () => {
    expect(
      redirectUriLines(`if (codeRow.redirect_uri !== input.redirectUri) throw err;`)
    ).toHaveLength(1);
    expect(redirectUriLines(`expect(row.redirect_uri === uri).toBe(true);`)).toHaveLength(1);
  });

  it('accepts the module the decision belongs to', () => {
    expect(
      redirectUriLines(`return allowsRedirectUri(client.redirect_uris, redirectUri);`)
    ).toEqual([]);
    expect(redirectUriLines(`if (!isSameRedirectUri(stored, presented)) throw err;`)).toEqual([]);
  });

  it('accepts reading a redirect target without deciding on it', () => {
    expect(redirectUriLines(`const redirectUri = params.get('redirect_uri');`)).toEqual([]);
    expect(redirectUriLines(`if (!client || !redirectUri) redirect('/');`)).toEqual([]);
    expect(redirectUriLines(`url.searchParams.set('redirect_uri', redirectUri);`)).toEqual([]);
    expect(redirectUriLines(`.eq('redirect_uri', redirectUri)`)).toEqual([]);
  });

  it('lets a comment name the pattern it forbids', () => {
    expect(redirectUriLines('// never client.redirect_uris.includes(redirectUri)')).toEqual([]);
    expect(redirectUriLines(' * `redirect_uri !== input.redirectUri` is the bug')).toEqual([]);
  });

  it('reports 1-based line numbers, and only for the offending lines', () => {
    const text = ['ok', 'client.redirect_uris.includes(uri)', 'ok', 'a.redirect_uri !== b'].join(
      '\n'
    );
    expect(redirectUriLines(text).map(({ line }) => line)).toEqual([2, 4]);
  });
});

describe('isScanned', () => {
  it('covers the OAuth endpoints and services, and skips tests and generated files', () => {
    expect(isScanned('app/mcp/authorize/route.ts')).toBe(true);
    expect(isScanned('backend/services/mcp/oauth-provider.ts')).toBe(true);
    expect(isScanned('app/mcp/authorize/route.test.ts')).toBe(false);
    expect(isScanned('app/mcp/__tests__/authorize.test.ts')).toBe(false);
    expect(isScanned('backend/config/generated/app-version.ts')).toBe(false);
    expect(isScanned('docs/adr/0179-the-loopback-port-is-not-part-of-the-registration.md')).toBe(
      false
    );
    expect(isScanned('android/app/build.gradle')).toBe(false);
  });

  it('exempts the module itself, which is where the comparison lives', () => {
    expect(isScanned(MODULE)).toBe(false);
  });
});

describe('scan', () => {
  it('reports the offending files with their line numbers', () => {
    const dir = tree({
      'app/mcp/authorize/route.ts': `ok\nclient.redirect_uris.includes(redirectUri)\n`,
      'backend/services/mcp/oauth-provider.ts': `codeRow.redirect_uri !== input.redirectUri\n`,
      'app/mcp/clean.ts': `allowsRedirectUri(registered, redirectUri)\n`,
    });

    const found = scan(
      ['app/mcp/authorize/route.ts', 'backend/services/mcp/oauth-provider.ts', 'app/mcp/clean.ts'],
      dir
    );

    expect(found.map(({ file }) => file)).toEqual([
      'app/mcp/authorize/route.ts',
      'backend/services/mcp/oauth-provider.ts',
    ]);
    expect(found[0].lines[0].line).toBe(2);
  });

  it('ignores excluded files and files that are gone', () => {
    const dir = tree({
      'app/mcp/__tests__/authorize.test.ts': `client.redirect_uris.includes(redirectUri)\n`,
      [MODULE]: `a.redirect_uri !== b\n`,
    });

    expect(scan(['app/mcp/__tests__/authorize.test.ts', MODULE, 'gone.ts'], dir)).toEqual([]);
  });
});
