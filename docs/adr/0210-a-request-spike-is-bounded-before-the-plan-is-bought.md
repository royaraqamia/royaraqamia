# A request spike is bounded before the plan is bought

In the seven days to 2026-11-21 the free origin was OOM-killed three times
(11-15, 11-16 and 11-20), each with `memoryLimit: "512Mi"` in Render's events.
Traffic was light: the instance that died on 11-20 reported 257 MB of RSS 39
seconds before the kill, so this was one request's allocation, not a crowd.

Two measurements made the request side concrete. A 7.5 MB DOCX — just under the
old 8 MB inflated-entry ceiling — added 166 MB of RSS in 722 ms while the DOM
XML parser built a tree; the service already sits at 300-425 MB and boots at
about 131 MB. The app's own `[memory]` samples put p75 at 341 MB, p95 at 411 MB
and the max at 425 MB, while the live V8 heap limit is 259 MiB (the blueprint's
`NODE_OPTIONS` is not present in the running service's environment).

## The decision

1. **Bound the request before buying memory.** The document reader now allows
   1 MB per inflated entry, 2 MB across a package, 5 MB for a PDF and one
   concurrent read. Memos and decks are fed from SAX events straight into the
   text collector; workbooks build a compact element tree only where attributes
   and subtrees are needed. `fast-xml-parser` is removed.
2. **Do not "apply" the missing heap cap on Free.** The live 259 MiB boundary is
   earlier than the blueprint's 384 (576 MiB total). Raising it while RSS reaches
   425 MB would let the heap grow into the container wall. Set it deliberately
   only after moving to a larger instance.
3. **Report the unexplained bytes.** `[memory]` now carries `heapTotalMb` and
   `remainderMb` (RSS minus heap total minus external), so the part of RSS a
   heap snapshot cannot see is visible in the log stream the owner reads.
   `arrayBuffersMb` is a breakdown of `externalMb`, not an extra bucket.
4. **Give the graph a voice.** `scripts/memory-watch.mjs` reads Render's memory
   metrics, restart events and the app's own `[memory]` lines without
   dependencies, and `.github/workflows/memory-watch.yml` keeps one issue
   labelled `origin-memory` — opened on an OOM, a p95 at or above 400 MiB, or
   one app sample above 400 MiB; edited on later warnings; closed when calm.
   The per-sample test is the one that would have seen the 11-20 spike.
5. **Keep the documented upgrade trigger.** `1c-2g` ($25) is the only Render plan
   that raises the 512 MB wall; `0.5c-512mb` ($7) only adds CPU. If the watch
   opens another issue after these caps land, buy the plan rather than lowering
   the caps further.

## The alternatives

- **Upgrade now.** The trigger in `docs/memory-budget.md` is already met, so this
  is defensible. It is not chosen first because a single bounded request was the
  likely cause and the fix is small, testable and keeps the current bill.
- **Rewrite the TypeScript backend in Rust.** The memory pressure is in the
  Next.js process, which stays while the UI stays React. A second runtime on the
  same 512 MB instance adds pressure rather than removing it; a Rust document
  parser would help only this one path, and a SAX parser in TypeScript removes
  the same tree without a second toolchain.
- **Raise the document caps again and rely on GC.** That is the condition that
  produced the measured 166 MB spike.

## Consequences

- A large document is now an ordinary refusal using the existing sentence, not
  a new state or new copy (ADR 0189's shape).
- Workbooks and ODS still build a small tree, bounded by the 2 MB archive budget.
- The watch needs `RENDER_API_KEY` in Actions secrets; it is a read-only Render
  caller and writes only a GitHub issue.
- The upgrade remains a product decision with a written trigger, not a guess.

## Amendment 2026-11-27

The early-warning watch is gone with the host. `scripts/memory-watch.mjs` and
`.github/workflows/memory-watch.yml` were deleted with `render.yaml`; nothing measures the box
automatically until #1885 lands, and the thresholds in this decision stay as the reasoning that
produced the caps.
