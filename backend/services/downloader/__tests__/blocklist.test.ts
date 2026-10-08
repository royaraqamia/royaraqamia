import { describe, expect, it } from 'vitest';
import type { DownloadBlockKind, DownloadBlocklistEntry } from '@/shared/contracts/downloader';
import { isUrlBlocked } from '@/backend/services/downloader/blocklist';

function entry(kind: DownloadBlockKind, value: string): DownloadBlocklistEntry {
  return {
    id: `${kind}:${value}`,
    kind,
    value,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: null,
  };
}

describe('isUrlBlocked', () => {
  it('returns false for an empty blocklist', () => {
    expect(isUrlBlocked('https://example.com/a', [])).toBe(false);
  });

  it('blocks the exact domain and every subdomain', () => {
    const entries = [entry('domain', 'example.com')];

    expect(isUrlBlocked('https://example.com/a', entries)).toBe(true);
    expect(isUrlBlocked('https://cdn.example.com/a', entries)).toBe(true);
  });

  it('does not block a lookalike suffix', () => {
    expect(isUrlBlocked('https://notexample.com/a', [entry('domain', 'example.com')])).toBe(false);
    expect(isUrlBlocked('https://example.com.evil.net/a', [entry('domain', 'example.com')])).toBe(
      false
    );
  });

  it('blocks only an exact url entry', () => {
    const entries = [entry('url', 'https://example.com/private')];

    expect(isUrlBlocked('https://example.com/private', entries)).toBe(true);
    expect(isUrlBlocked('https://example.com/private/2', entries)).toBe(false);
    expect(isUrlBlocked('https://example.com/public', entries)).toBe(false);
  });

  it('ignores an unparseable url for a domain entry but still matches a url entry', () => {
    expect(isUrlBlocked('not a url', [entry('domain', 'example.com')])).toBe(false);
    expect(isUrlBlocked('not a url', [entry('url', 'not a url')])).toBe(true);
  });
});
