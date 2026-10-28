# Release notes for the Android shell

One file per change that ships. A pull request that touches `android/**`,
`capacitor.config.ts` or a Capacitor plugin dependency adds one here, named after
itself (`fix-offline-retry.md`), and the weekly release folds every file in this
folder into that release's changelog.

Write what a user notices, in Arabic, as list items:

```markdown
- إصلاح: لم يعد التطبيق يفقد موضعه في الصفحة عند العودة إليه.
```

The release workflow deletes the fragments it shipped and freezes them into
`android/release-notes/<version>.md`; the same text goes into the GitHub release
and `public/android/changelog.json`, which is what `/account/changelog` reads
inside the app. `scripts/android-release.mjs --check-notes <base>` fails a pull
request that changes the shell without one.

This file is not a note: the leading underscore keeps it out (ADR-0090).
