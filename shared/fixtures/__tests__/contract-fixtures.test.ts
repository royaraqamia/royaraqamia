import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MyUsageResponseSchema } from '@/shared/contracts/plans';

/**
 * The contract's fixture set, from the web side (#665).
 *
 * A Zod change and a generated Kotlin type can only be held together by reading
 * the same bodies on both sides, so the payloads live in
 * `shared/fixtures/contracts/my-usage/` and the app's suite reads them too
 * (`ContractFixturesTest.kt`). Expectation is part of the fixture: the clients
 * must agree on which bodies are *unreadable* as well, because that is the
 * behaviour a screen falls back on.
 *
 * Both suites read `manifest.json` rather than the directory, so deleting a
 * case file fails both, and both refuse a payload the manifest does not list.
 * The rules and the rest of the pair are on `docs/mobile/two-clients.md`.
 */

type Case = {
  name: string;
  expect: 'valid' | 'invalid';
  /** A fragment of the field each client must name in the failure. */
  names?: string;
};

type Manifest = {
  schemaVersion: number;
  contract: string;
  cases: Case[];
};

type Payload = { name: string; body: unknown };

const DIR = resolve(process.cwd(), 'shared/fixtures/contracts/my-usage');
const MANIFEST = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) as Manifest;

function payload(name: string): Payload {
  return JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8')) as Payload;
}

/** The payload files the directory holds, minus the manifest that lists them. */
const payloadFiles = readdirSync(DIR)
  .filter((file) => file.endsWith('.json') && file !== 'manifest.json')
  .sort();

describe('the contract fixtures both clients read', () => {
  it('lists exactly the payloads that sit beside it', () => {
    const listed = MANIFEST.cases.map((entry) => `${entry.name}.json`).sort();

    // A case file without a line here is a body only one client would run; a
    // line without a file is a body neither would notice was gone.
    expect(payloadFiles).toEqual(listed);
  });

  it('names its contract and asks both clients to decode it', () => {
    expect(MANIFEST.schemaVersion).toBe(1);
    expect(MANIFEST.contract).toBe('MyUsageResponseSchema');
    expect(MANIFEST.cases.length).toBeGreaterThan(0);
  });

  it('gives every payload the name of its case', () => {
    for (const entry of MANIFEST.cases) {
      expect(payload(entry.name).name, entry.name).toBe(entry.name);
    }
  });

  it('parses a body the contract allows', () => {
    for (const entry of MANIFEST.cases.filter((candidate) => candidate.expect === 'valid')) {
      const result = MyUsageResponseSchema.safeParse(payload(entry.name).body);
      expect(result.success, `${entry.name}: ${result.error?.message ?? ''}`).toBe(true);
    }
  });

  it('refuses a body the contract does not, naming the field', () => {
    const refused = MANIFEST.cases.filter((candidate) => candidate.expect === 'invalid');
    expect(refused.length).toBeGreaterThan(0);

    for (const entry of refused) {
      const result = MyUsageResponseSchema.safeParse(payload(entry.name).body);
      expect(result.success, entry.name).toBe(false);
      if (result.success || !entry.names) continue;

      const named = result.error.issues.map((issue) => issue.path.join('.')).join(' ');
      expect(named, entry.name).toContain(entry.names);
    }
  });
});
