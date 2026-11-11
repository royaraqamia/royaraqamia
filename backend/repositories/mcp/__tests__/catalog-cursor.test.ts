import { describe, expect, it } from 'vitest';

import { catalogSearchPattern, decodeCatalogCursor, encodeCatalogCursor } from '../catalog-cursor';

/**
 * The catalogue's keyset cursor and its search pattern.
 *
 * Both values end up inside a PostgREST filter, which is comma- and
 * parenthesis-delimited: a cursor we did not write, or a term containing the
 * pattern's own wildcards, must fail closed rather than corrupt the expression.
 * The store's order adds a second cursor shape (`000003:com.supabase/mcp`), and a
 * decoder that rejected it would silently restart every page after the first.
 */

describe('the catalogue cursor', () => {
  it('round-trips a registry name', () => {
    expect(decodeCatalogCursor(encodeCatalogCursor('com.supabase/mcp'))).toBe('com.supabase/mcp');
  });

  it('round-trips a store key', () => {
    expect(decodeCatalogCursor(encodeCatalogCursor('000003:com.supabase/mcp'))).toBe(
      '000003:com.supabase/mcp'
    );
  });

  it('refuses anything it did not write', () => {
    expect(decodeCatalogCursor('not-a-cursor')).toBeNull();
    expect(decodeCatalogCursor(Buffer.from('{"n":"a,b"}').toString('base64url'))).toBeNull();
    expect(decodeCatalogCursor(Buffer.from('{"n":"no-slash"}').toString('base64url'))).toBeNull();
    expect(decodeCatalogCursor(Buffer.from('{"n":"a/b),or(x"}').toString('base64url'))).toBeNull();
    expect(decodeCatalogCursor(Buffer.from('{"x":1}').toString('base64url'))).toBeNull();
  });
});

describe('the search pattern', () => {
  it('escapes the wildcards a member may type', () => {
    expect(catalogSearchPattern('100%')).toBe('100\\%');
    expect(catalogSearchPattern('a_b')).toBe('a\\_b');
    expect(catalogSearchPattern('back\\slash')).toBe('back\\\\slash');
  });

  it('drops the characters that would split a filter expression', () => {
    expect(catalogSearchPattern('a,b(c)d')).toBe('a b c d');
  });
});
