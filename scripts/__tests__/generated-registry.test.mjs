import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const registry = JSON.parse(readFileSync(join(ROOT, 'generated.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const scripts = readdirSync(join(ROOT, 'scripts'))
  .filter((file) => /^generate-.*\.mjs$/.test(file))
  .sort();

/**
 * A generator without an owner is how the icon family went unchecked (#1790):
 * the registry is the list that refuses the next one, not a document.
 */
describe('the generated-artifact registry owns every generator', () => {
  it('lists each generator exactly once', () => {
    const listed = [...registry.generators, ...registry.buildOnly]
      .map((entry) => entry.script)
      .sort();
    expect(listed).toEqual(scripts);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('gives every checked generator a real command and a list of owned files', () => {
    expect(pkg.scripts['check:generated']).toBe('node scripts/check-generated.mjs');
    for (const entry of registry.generators) {
      expect(existsSync(join(ROOT, 'scripts', entry.script))).toBe(true);
      expect(entry.owns.length).toBeGreaterThan(0);
      const match = /^npm run ([a-z0-9:-]+)$/.exec(entry.check);
      expect(match, `${entry.script}: ${entry.check}`).not.toBeNull();
      expect(pkg.scripts[match[1]], `${entry.script}: missing npm script`).toBeTruthy();
    }
  });

  it('gives every unregistered generator a reason instead of a silent exemption', () => {
    for (const entry of registry.buildOnly) {
      expect(existsSync(join(ROOT, 'scripts', entry.script))).toBe(true);
      expect(entry.reason.length).toBeGreaterThan(20);
      expect(entry.check).toBeUndefined();
      expect(entry.owns).toBeUndefined();
    }
  });

  it('registers the two icon families that started this', () => {
    const checked = registry.generators.map((entry) => entry.script);
    expect(checked).toContain('generate-icons.mjs');
    expect(checked).toContain('generate-android-assets.mjs');
    expect(pkg.scripts['check:icons']).toBe('node scripts/generate-icons.mjs --check');
    expect(pkg.scripts['check:android-assets']).toBe(
      'node scripts/generate-android-assets.mjs --check'
    );
  });
});
