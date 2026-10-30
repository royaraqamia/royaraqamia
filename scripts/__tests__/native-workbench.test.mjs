import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The workbench and the plan card (#647, #501), held to the two properties that
 * a rendered frame cannot show.
 *
 * 1. **The workbench is not in the release APK.** It signs in and reads a real
 *    route, and it reads a project URL and key that belong to one machine, so a
 *    build that ships must contain neither the activity nor the values. That is
 *    true today because the activity is declared only in `src/debug` and the
 *    fields are declared only in the `debug` build type — and it stays true
 *    because this test fails if either moves.
 * 2. **The card's copy is the site's copy.** Arabic writes a letter's marks in
 *    more than one order; two spellings render the same and compare unequal, so a
 *    retyped label drifts silently until an exact-text test misses it. The
 *    strings are compared to `frontend/ui/account/plan-view.tsx` byte for byte,
 *    and the Kotlin file is required to be NFC.
 *
 * Checked as source text, like `webview-settings.test.mjs`: the app has no
 * host-side test that can build an activity or a Compose tree.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ANDROID = join(ROOT, 'android', 'app', 'src');

function filesUnder(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const debugManifest = readFileSync(join(ANDROID, 'debug', 'AndroidManifest.xml'), 'utf8');
const mainManifest = readFileSync(join(ANDROID, 'main', 'AndroidManifest.xml'), 'utf8');
const buildGradle = readFileSync(join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');

describe('the workbench is a debug build', () => {
  it('is declared as its own launcher entry, in the debug manifest only', () => {
    expect(debugManifest).toContain('android:name=".debug.WorkbenchActivity"');
    expect(debugManifest).toContain('android.intent.category.LAUNCHER');

    // The release manifest is the one that ships: no activity, no alias, no entry.
    expect(mainManifest).not.toContain('Workbench');
  });

  it('lives in the debug source set, and nothing in main mentions it', () => {
    const workbench = filesUnder(ANDROID).filter((path) => /Workbench/i.test(path));

    expect(workbench.length).toBeGreaterThan(0);
    for (const path of workbench) {
      expect(relative(ANDROID, path).split(sep)[0]).toBe('debug');
    }
  });

  it('is the only reader of the debug-only project values', () => {
    const mainSources = filesUnder(join(ANDROID, 'main'));
    for (const path of mainSources) {
      expect(readFileSync(path, 'utf8')).not.toContain('BuildConfig.SUPABASE');
    }

    // The fields exist for the debug build type, so a release build has no
    // `BuildConfig.SUPABASE_URL` to read even if a screen tried to.
    expect(buildGradle).toContain('debugSupabaseUrl');
    expect(buildGradle).toMatch(/debug \{[\s\S]*?SUPABASE_URL[\s\S]*?\}/);
  });
});

describe('the plan card says what the site says', () => {
  const view = readFileSync(join(ROOT, 'frontend', 'ui', 'account', 'plan-view.tsx'), 'utf8');
  const copy = readFileSync(
    join(ANDROID, 'main', 'kotlin', 'com', 'royaraqamia', 'app', 'plans', 'UsageCopy.kt'),
    'utf8'
  );

  function literal(pattern, name) {
    const match = view.match(pattern);
    if (!match) throw new Error(`plan-view.tsx: could not find ${name}`);

    return match[1].trim();
  }

  it('reads the state in NFC, like every other source file', () => {
    expect(copy.normalize('NFC')).toBe(copy);
  });

  it('names each plan as the site names it', () => {
    expect(copy).toContain(
      `PLAN_FREE = "${literal(/PLAN_LABELS = \{ free: '([^']+)', pro: /, 'PLAN_LABELS.free')}"`
    );
    expect(copy).toContain(
      `PLAN_PRO = "${literal(/PLAN_LABELS = \{ free: '[^']+', pro: '([^']+)' \}/, 'PLAN_LABELS.pro')}"`
    );
    expect(copy).toContain(
      `UNLIMITED = "${literal(/state\.unlimited \? '([^']+)' :/, "'غير محدود'")}"`
    );
  });

  it('carries the section title, the retry and the sign-in prompt unchanged', () => {
    expect(copy).toContain(`TITLE = "${literal(/sm:text-base">([^<]+)<\/p>/, 'the card title')}"`);
    expect(copy).toContain(
      `FAILED = "${literal(/role="alert" className="text-sm text-muted-foreground">\s*([^<]+)/, 'the failure line')}"`
    );
    expect(copy).toContain(
      `RETRY = "${literal(/<RotateCw[^>]*\/>\s*([^<]+)\s*<\/Button>/, 'the retry label')}"`
    );
    expect(copy).toContain(
      `SIGNED_OUT = "${literal(/text-base font-bold text-foreground">([^<]+)<\/p>/, 'the sign-in title')}"`
    );
    expect(copy).toContain(
      `SIGNED_OUT_BODY = "${literal(/text-xs text-muted-foreground sm:text-sm">\s*([^<]+)/, 'the sign-in body')}"`
    );
  });
});
