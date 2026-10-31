import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The shell's own baseline profile (#762) is a generated artifact that is
 * committed, so the two ways it can go wrong are silent: it can be deleted (the
 * APK quietly falls back to the libraries' profiles) and the wiring that
 * regenerates it can be removed. Both are pinned here, and the profile's own
 * content is pinned to the shell rather than to a count of lines.
 */

const PROFILE = 'android/app/src/release/generated/baselineProfiles/baseline-prof.txt';

const profile = readFileSync(PROFILE, 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const app = readFileSync('android/app/build.gradle', 'utf8');
const settings = readFileSync('android/settings.gradle', 'utf8');
const generator = readFileSync('android/baselineprofile/build.gradle', 'utf8');

describe("the shell's baseline profile", () => {
  it('names the launcher and the theme it draws the first frame from', () => {
    expect(profile).toContain('Lcom/royaraqamia/app/shell/ShellActivity;');
    expect(profile).toContain('Lcom/royaraqamia/app/theme/ColorsKt;');
    expect(profile).toContain('royColorScheme()Landroidx/compose/material3/ColorScheme;');
  });

  it('is a real profile, not a stub', () => {
    const rules = profile.split('\n').filter((line) => line.trim().length > 0);
    expect(rules.length).toBeGreaterThan(5_000);
  });

  it('is what the app packs and what regenerates it', () => {
    // The app applies the consumer plugin and depends on the generator module;
    // the generator targets `:app`; and one command regenerates the file.
    expect(app).toContain("apply plugin: 'androidx.baselineprofile'");
    expect(app).toContain("baselineProfile project(':baselineprofile')");
    expect(app).toContain('saveInSrc = true');
    expect(settings).toContain("include ':baselineprofile'");
    expect(generator).toContain("targetProjectPath = ':app'");
    expect(packageJson.scripts['android:profile']).toBe('node scripts/android.mjs profile');
  });
});
