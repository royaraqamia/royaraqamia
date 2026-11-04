import { z } from 'zod';

/**
 * The Android changelog, as the release cut writes it (ADR-0090).
 *
 * `public/android/changelog.json` is a static file the release cut prepends a
 * release to, so both clients read one list: the page's view
 * (`frontend/ui/account/changelog-view.tsx`) and the app's `ChangelogScreen.kt`.
 * The schema is here rather than in the screen so a field the file stops
 * carrying is a compile error in Kotlin instead of a blank release card
 * (ADR-0098).
 *
 * A release with no notes is still a release the file may hold; both clients
 * drop it rather than drawing an empty card, which is why the shape allows an
 * empty list and the filtering lives with each reader.
 */
export const AndroidReleaseSchema = z.object({
  version: z.string(),
  versionCode: z.number().int(),
  releasedAt: z.string(),
  notes: z.array(z.string()),
});

export type AndroidRelease = z.infer<typeof AndroidReleaseSchema>;

export const AndroidChangelogSchema = z.object({
  releases: z.array(AndroidReleaseSchema),
});

export type AndroidChangelog = z.infer<typeof AndroidChangelogSchema>;
