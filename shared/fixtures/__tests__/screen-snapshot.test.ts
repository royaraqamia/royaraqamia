import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveScreen } from '@/shared/contracts/screens';
import { ScreenContextSnapshotSchema } from '@/shared/contracts/screen-context-schema';

/**
 * The screen snapshot and the route table, from the web side (#1422).
 *
 * The app publishes the same snapshot and places routes with the same table, and
 * both are the kind of thing two clients implement slightly differently: a field
 * named `screenId` here and `screen_id` there is a snapshot the model silently
 * never sees. So the fixture is what the site computes, and the app's
 * `ScreenSnapshotFixtureTest` proves the Kotlin computes it too (ADR-0098).
 *
 * The key check is the load-bearing one. It fails when the schema grows a field
 * the fixture has not been taught - which is the same edit the app's generated
 * type gets for free, and therefore the moment to ask whether the app's
 * publisher writes it.
 */

type Fixture = {
  contract: string;
  snapshot: Record<string, unknown>;
  resolver: Array<{
    name: string;
    route: string;
    tab: string | null;
    screenId: string;
    product: string;
  }>;
};

const FIXTURE = JSON.parse(
  readFileSync(resolve(process.cwd(), 'shared/fixtures/parity/screen-snapshot.json'), 'utf8')
) as Fixture;

describe('the screen snapshot fixture', () => {
  it('names the schema both clients read', () => {
    expect(FIXTURE.contract).toBe('ScreenContextSnapshotSchema');
  });

  it('carries exactly the fields the schema declares', () => {
    expect(Object.keys(FIXTURE.snapshot).sort()).toEqual(
      Object.keys(ScreenContextSnapshotSchema.shape).sort()
    );
  });

  it('is a snapshot the server accepts', () => {
    const parsed = ScreenContextSnapshotSchema.safeParse(FIXTURE.snapshot);
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
  });
});

describe('the resolver fixture', () => {
  for (const row of FIXTURE.resolver) {
    it(row.name, () => {
      const resolved = resolveScreen(row.route, row.tab ? `tab=${row.tab}` : '');
      const expected =
        row.screenId === '' ? null : { screenId: row.screenId, product: row.product, tab: row.tab };
      expect(resolved).toEqual(expected);
    });
  }
});
