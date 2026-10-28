# Release notes for the Android shell

One file per change that ships. A pull request that touches `android/**`,
`capacitor.config.ts` or a Capacitor plugin dependency adds one here, and the
weekly release folds every file in this folder into that release's changelog.

Do not hand-write the file — run the helper, which names it, normalises it and
checks the style:

```bash
npm run android:note -- "إصلاح: لم يعد التطبيق يفقد موضعه في الصفحة عند العودة إليه."
npm run android:note -- --list
```

Each line is one thing a user notices, in Arabic, prefixed `ميزة:` (new),
`إصلاح:` (broken, now works) or `تحسين:` (faster, simpler, clearer). No file
names, versions, commit types or internal terms. A purely internal change still
ships an APK, so it still needs a line:
`تحسين: تحسينات عامة في الأداء والاستقرار`.

Put the same lines in the pull request body under `## Release note`. The release
workflow deletes the fragments it shipped and freezes them into
`android/release-notes/<version>.md`; the same text goes into the GitHub release
and `public/android/changelog.json`, which is what `/account/changelog` reads
inside the app. `scripts/android-release.mjs --check-notes <base>` fails a pull
request that changes the shell without one.

This file is not a note: the leading underscore keeps it out (ADR-0090).
