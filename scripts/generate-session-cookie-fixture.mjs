// Generates shared/fixtures/session-cookie/manifest.json (#1194).
//
// The document's session cookie is `@supabase/ssr`'s format, not ours: the
// `base64-` prefix, the 3180-character chunks and the JSON inside are the
// package's decisions. The fixture is written by the package itself â€” a server
// client with a canned token answer, and whatever it puts in `setAll` is what
// goes in the file â€” so the app's reader is tested against the real format
// rather than against a transcription of it.
//
// Run with `node scripts/generate-session-cookie-fixture.mjs`; the web suite
// (`shared/fixtures/__tests__/session-cookie.test.ts`) re-derives every case and
// fails when the two disagree, which is the check that a package upgrade did
// not move the format under the app.

import { writeFileSync } from 'node:fs';
import { createServerClient } from '@supabase/ssr';

const authUrl = 'https://abcdefghijklmnop.supabase.co/auth/v1';
const projectUrl = 'https://abcdefghijklmnop.supabase.co';
const storageKey = 'sb-abcdefghijklmnop-auth-token';

/** A session body as GoTrue answers one, spelled out so the fixture is readable. */
function session({ access, refresh, userId, expiresAt, name }) {
  return {
    access_token: access,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: refresh,
    user: { id: userId, email: 'a@example.com', user_metadata: { full_name: name } },
  };
}

/** What `@supabase/ssr` writes when auth-js stores the answer. */
async function cookiesFor(answer) {
  const jar = new Map();
  const supabase = createServerClient(projectUrl, 'publishable-key', {
    cookieOptions: { name: storageKey },
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

const cases = [
  {
    name: 'a-short-session',
    session: session({
      access: 'access-1',
      refresh: 'refresh-1',
      userId: 'user-1',
      expiresAt: 4102444800,
      name: 'Roya',
    }),
  },
  {
    name: 'a-long-session-is-chunked',
    session: session({
      access: 'access-2',
      refresh: 'refresh-2',
      userId: 'user-2',
      expiresAt: 4102444800,
      name: 'Ù†'.repeat(1200),
    }),
  },
];

const written = [];
for (const testCase of cases) {
  const cookies = await cookiesFor(testCase.session);
  written.push({
    name: testCase.name,
    session: testCase.session,
    cookies,
    expected: {
      accessToken: testCase.session.access_token,
      refreshToken: testCase.session.refresh_token,
      userId: testCase.session.user.id,
      expiresAt: testCase.session.expires_at,
    },
  });
}

const manifest = {
  package: '@supabase/ssr',
  authUrl,
  storageKey,
  cases: written,
};

const target = new URL('../shared/fixtures/session-cookie/manifest.json', import.meta.url);
writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${target.pathname} (${written.length} cases)`);
