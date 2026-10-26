# The device diagnostics page is withdrawn

ADR-0070 gave the device's own data a public shell at `/device`: a data-free document that
listed every Local Store copy, let a visitor retry a failed write, and removed a copy or a kept
recitation. It was reached from `/account`, linked from `/offline`, kept in the worker's
sign-out keep-list, and warmed by the account row that pointed at it.

It is withdrawn. The page was doing three jobs, and only one of them was a page: a diagnostics
view no other surface linked to, a deletion control whose only purpose was a shared device, and a
proof of concept for the cached-shell shape that ADR-0073 later applied to the four product
dashboards. The shape outlived the page; the page itself was visited rarely enough that it cost a
route, a service-worker cache entry, a slot in the precache accounting and a native bridge method
to keep working.

## The decision

The route, its view and every integration that existed for it are removed.

- **The route is gone, with no redirect.** `/device` answers 404. A document already cached on an
  existing install is no longer kept through sign-out and ages out of the runtime cache with the
  rest. Nothing else links to it.
- **Its entry points go with it.** The `/account` row, the `/offline` link, the sitemap entry
  and the `perf/surfaces.json` row are deleted. `/offline` is once again only a retry and a
  description.
- **The worker forgets it.** `/device` leaves `SIGN_OUT_SHELL_PATHS` and the precache
  generator's non-public exclusion. The list of sign-out shells is now exactly the build's
  precached public routes plus the fixed offline shell and icons.
- **The read side goes.** `frontend/shared/local-store/device-copy.ts` (the listing, the
  per-item retry, the delete-by-identity), `listDownloadedSuras`, `removeAllAudio`,
  `SurahAudioCopySummary` and `readShellLastFlush` had no other caller. The product registry
  that lived beside them (`LOCAL_STORE_PRODUCTS`, `LOCAL_STORE_ROOTS`) answers a different
  question — whether every product's Store has an identity root and a first-frame snapshot —
  and moves to `frontend/shared/local-store/products.ts` unchanged, with its guard test.
- **The native record goes.** `SyncFlushRecord`, its JVM test, the worker's persistence of the
  drain report and `RoyShellSync.lastFlush()` existed only so the page could name the shell's
  last background drain (#455). `schedule()` and `report()` remain: they are the drain itself.
- **The snapshot's public scope goes.** `PUBLIC_SNAPSHOT_SCOPE` was introduced for #555's
  public rows, but only `/device` ever wrote one. Snapshots are identity-scoped again, and the
  sign-out purge is a single `clearSnapshots`.

## Consequences

- **No in-app way to delete a copy or a kept recitation.** Sign-out still keeps the account
  namespace on disk (ADR-0028), and the only way to drop it now is clearing site data in the
  browser, or the app's storage settings on Android. This is a deliberate reduction: the page
  was the affordance, and it is not being replaced by an `/account` view, which is
  never-cached and therefore unusable in exactly the offline moment the page existed for.
- **The queue is visible only as a count.** The sync pill keeps reporting pending and failed
  writes; per-item type, entity, age, attempts and last error have no surface.
- **The offline story loses one page, not a shell.** `/offline` and the product dashboards keep
  the cached-shell behaviour ADR-0070 pioneered and ADR-0073 generalised. Nothing about the
  worker's caching rules changes beyond the removed entry.
- **ADR-0070 is history.** Its rationale for a data-free cached shell remains the reason the
  product pages are shaped as they are; its description of `/device` no longer describes the
  app.
