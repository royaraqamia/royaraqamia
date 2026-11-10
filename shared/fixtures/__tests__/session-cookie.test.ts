import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServerClient } from '@supabase/ssr';
import { describe, expect, it } from 'vitest';

/**
 * The document's session cookie, from the package that owns it (#1194).
 *
 * The app reads this cookie to learn who the site signed in as, and writes it
 * back when it rotates the session. The format — `base64-`, 3180-character
 * chunks, the JSON inside — belongs to `@supabase/ssr`, so the fixture is not a
 * transcription: every case's cookies are re-derived here through the real
 * package, and a package upgrade that moves the encoding fails this suite and
 * `DocumentSessionTest` together.
 *
 * `scripts/generate-session-cookie-fixture.mjs` writes the file; the derivation
 * is deliberately its own copy rather than a shared helper, so a mistake in the
 * generator is a red test rather than a fixture that agrees with itself.
 */

interface Case {
  name: string;
  session: Record<string, unknown> & {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    user: { id: string };
  };
  cookies: { name: string; value: string }[];
  expected: {
    accessToken: string;
    refreshToken: string;
    userId: string;
    expiresAt: number;
  };
}

interface Manifest {
  package: string;
  authUrl: string;
  storageKey: string;
  cases: Case[];
}

const manifest: Manifest = JSON.parse(
  readFileSync(join(process.cwd(), 'shared/fixtures/session-cookie/manifest.json'), 'utf8')
);

/** What `@supabase/ssr` writes when auth-js stores a token answer. */
async function cookiesFor(answer: Case['session']): Promise<{ name: string; value: string }[]> {
  const jar = new Map<string, string>();
  const supabase = createServerClient('https://abcdefghijklmnop.supabase.co', 'publishable-key', {
    cookieOptions: { name: manifest.storageKey },
    global: {
      fetch: async () =>
        new Response(JSON.stringify(answer), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    },
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          if (value === '') jar.delete(name);
          else jar.set(name, value);
        }
      },
    },
  });
  await supabase.auth.refreshSession({ refresh_token: answer.refresh_token });
  return [...jar].map(([name, value]) => ({ name, value }));
}

describe('the session cookie fixture', () => {
  it('is the package it names', () => {
    expect(manifest.package).toBe('@supabase/ssr');
    expect(manifest.storageKey).toBe('sb-abcdefghijklmnop-auth-token');
    expect(manifest.authUrl).toBe('https://abcdefghijklmnop.supabase.co/auth/v1');
  });

  for (const testCase of manifest.cases) {
    it(`is what the package writes for ${testCase.name}`, async () => {
      expect(await cookiesFor(testCase.session)).toEqual(testCase.cookies);
    });

    it(`is what the package reads back for ${testCase.name}`, async () => {
      const jar = new Map(testCase.cookies.map(({ name, value }) => [name, value]));
      const supabase = createServerClient(
        'https://abcdefghijklmnop.supabase.co',
        'publishable-key',
        {
          cookieOptions: { name: manifest.storageKey },
          // Reading a stored session must not spend it: the fixture's expiry is a
          // fixed number so the file is deterministic, and a client that refreshed
          // it would be testing the network instead of the format.
          auth: { autoRefreshToken: false },
          global: {
            fetch: async () => {
              throw new Error('the read-back case asks the server nothing');
            },
          },
          cookies: {
            getAll: () => [...jar].map(([name, value]) => ({ name, value })),
            setAll: (cookies) => {
              for (const { name, value } of cookies) {
                if (value === '') jar.delete(name);
                else jar.set(name, value);
              }
            },
          },
        }
      );

      const { data, error } = await supabase.auth.getSession();

      expect(error).toBeNull();
      expect(data.session?.access_token).toBe(testCase.expected.accessToken);
      expect(data.session?.refresh_token).toBe(testCase.expected.refreshToken);
      expect(data.session?.user.id).toBe(testCase.expected.userId);
      expect(data.session?.expires_at).toBe(testCase.expected.expiresAt);
    });

    it(`names the case ${testCase.name} and carries the value the app reads`, () => {
      expect(testCase.cookies.some(({ name }) => name.startsWith(manifest.storageKey))).toBe(true);
      expect(testCase.cookies.every(({ value }) => value.length > 0)).toBe(true);
      expect(testCase.expected).toEqual({
        accessToken: testCase.session.access_token,
        refreshToken: testCase.session.refresh_token,
        userId: testCase.session.user.id,
        expiresAt: testCase.session.expires_at,
      });
    });
  }
});
