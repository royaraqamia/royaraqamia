import manifest from '@/public/android/latest.json';

/**
 * The installed app below this counter is too old for the server (ADR-0043,
 * #503).
 *
 * It is read from the same `public/android/latest.json` the app checks, so the
 * manifest a device downloads and the floor the API enforces can never name two
 * different counters in one deploy. Raising the floor is a deliberate publish
 * (`npm run android:publish -- --min …`), not a side effect of a web release.
 */
export const minimumSupportedAppVersionCode =
  Number.isInteger(manifest.minSupportedVersionCode) && manifest.minSupportedVersionCode > 0
    ? manifest.minSupportedVersionCode
    : 0;
