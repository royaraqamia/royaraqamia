import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The bundled IME themes are assets, so a typo in a stylesheet or in the
 * extension manifest is invisible until a member opens the keyboard. These
 * checks keep the two branded defaults valid and keep the upstream themes
 * selectable alongside them.
 */

const REPO = process.cwd();
const THEME_DIR = resolve(
  REPO,
  'android/keyboard/src/main/assets/ime/theme/org.florisboard.themes'
);
const SCHEMA = 'https://schemas.florisboard.org/snygg/v2/stylesheet';
const PRIMARY = '#9333ea';
const SELECTED = '#7b56e1';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const stylesheet = (id) => readJson(resolve(THEME_DIR, 'stylesheets', `${id}.json`));
const extension = readJson(resolve(THEME_DIR, 'extension.json'));
const prefs = readFileSync(
  resolve(REPO, 'android/keyboard/src/main/kotlin/dev/patrickgold/florisboard/app/AppPrefs.kt'),
  'utf8'
);

const brandTheme = (id) => extension.themes.find((theme) => theme.id === id);

describe('the branded keyboard stylesheets', () => {
  it.each([
    ['roy_day', false],
    ['roy_night', true],
  ])('%s uses the stylesheet schema and our purple palette', (id, isNight) => {
    const sheet = stylesheet(id);

    expect(sheet.$schema).toBe(SCHEMA);
    expect(sheet['@defines']['--primary'].toLowerCase()).toBe(PRIMARY);
    expect(sheet['@defines']['--primary-variant'].toLowerCase()).toBe(SELECTED);
    expect(sheet['@defines']['--secondary'].toLowerCase()).toBe('#7c3aed');
    expect(sheet['@defines']['--on-primary'].toLowerCase()).toBe('#ffffff');
    expect(sheet['window'].background).toBe('var(--background)');
    expect(sheet['key[code=10]'].background).toBe('var(--primary)');
    if (isNight) {
      expect(sheet['@defines']['--background'].toLowerCase()).toBe('#121216');
    }
  });

  it('registers both themes with the right night flag and our authors', () => {
    const day = brandTheme('roy_day');
    const night = brandTheme('roy_night');

    expect(day).toMatchObject({ label: 'Roy Day', isNight: false });
    expect(night).toMatchObject({ label: 'Roy Night', isNight: true });
    for (const theme of [day, night]) {
      expect(theme.authors).toContain('royaraqamia');
      expect(theme.authors).not.toContain('patrickgold');
    }
  });

  it('keeps every upstream theme installed and pointing at a real stylesheet', () => {
    for (const id of [
      'floris_day',
      'floris_day_borderless',
      'floris_night',
      'floris_night_borderless',
      'floris_pure_night',
      'floris_pure_night_borderless',
    ]) {
      expect(brandTheme(id)).toBeDefined();
    }
    for (const theme of extension.themes) {
      expect(existsSync(resolve(THEME_DIR, 'stylesheets', `${theme.id}.json`))).toBe(true);
    }
  });

  it('makes them the defaults a fresh install picks', () => {
    expect(prefs).toMatch(/default = extCoreTheme\("roy_day"\)/);
    expect(prefs).toMatch(/default = extCoreTheme\("roy_night"\)/);
  });
});
