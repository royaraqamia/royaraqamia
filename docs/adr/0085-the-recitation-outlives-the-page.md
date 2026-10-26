# The recitation outlives the page

The player was a child of the sura reader. `audio-player.tsx` owned the `<audio>` element, its queue and
its unmount effect, and that effect paused the recitation: leaving `/quran/12` stopped the sound by
design. The queue also advanced in JavaScript — `ended` fired, a source was looked up asynchronously and
the next file was assigned — which is fine while the page is alive and wrong the moment the renderer is
not. In the Android shell, `BridgeActivity.onPause` pauses the WebView when the app goes to the
background, so the current Ayah played to its end and the next one never started. That is the pause
users saw "after some time" with the screen off, and it was not a network problem: it was a callback
that never ran.

Nothing told the system the app had media either. The repository had no Media Session, so Android had no
notification to draw, no lock-screen controls and no reason to treat the WebView as a player.

## The decision, in six parts

1. **One engine per document.** A provider in the root layout owns a `RecitationEngine`
   (`frontend/shared/recitation/engine.ts`), and its `<audio>` element is mounted into `document.body`
   outside React's tree. A route change cannot unmount it, because React never owned it. The reader's
   float and a new mini player are two views of one store, not two players.

2. **The queue belongs to the engine.** On `ended` it moves to the next Ayah itself, and the next Ayah
   is fetched to a blob while the current one is still sounding. A stalled main thread or a cold network
   at the file boundary is therefore not in the path of the transition. When the last Ayah of a sura
   ends, the next sura's manifest is loaded (it was prefetched too) and the recitation continues; An-Nas
   is where it stops.

3. **The system gets a Media Session.** Title, Ayah, reciter and one cover; play, pause, stop, previous,
   next, ten-second seeks and a seek bar spanning the whole sura. The position is derived from the
   manifest's CBR sizes and corrected with each file's real duration as it plays, so the bar moves once
   per second rather than once per Ayah. Every handler is registered on its own, so a browser that
   refuses one action keeps the rest.

4. **The position survives a relaunch, paused.** The last sura, Ayah and offset are one `localStorage`
   record. On load the engine restores the state, the mini player appears, and the first press resumes a
   second and a half before the stored offset so the first word is not clipped. It never auto-plays: a
   browser would refuse the gesture, and a phone that starts reciting by itself is a bug.

5. **The mini player is on every page except the reader it is playing.** On that sura's page the float
   is the control (ADR-0083 is unchanged); everywhere else — the Quran index, the rest of the app, a
   different sura's reader — the slim bar shows the sura, the Ayah and the three controls, and tapping
   the middle returns to the Ayah that is playing. The float moves above the bar rather than sitting
   under it.

6. **The engine is an interface, not a promise about the platform.** Playback is chosen once at
   start-up. The browser engine is this one. The native shell's media3 service will implement the same
   operations (PR 2, its own ADR), because a WebView cannot keep a JavaScript queue alive with the
   screen off; the UI must not know which engine it is talking to.

## Considered options

- **Render the `<audio>` in the root layout's JSX.** Rejected: React can unmount, reorder or remount a
  node, and the one thing the element must not do is move. Appending it to the body, outside the tree,
  is the only ownership that matches "as long as the document exists".
- **Keep the player in the reader and portal its element to the layout.** Rejected: two owners, two
  lifecycles and a React boundary to reason about, to reach the same single element the engine already
  holds.
- **One long file per sura instead of one file per Ayah.** Rejected in ADR-0062 and still: it would make
  the transition gapless and the seek trivial, but it costs a reader two hours of data for twenty Ayat,
  and the Ayah being played would no longer be the file being played.
- **MediaSource with fetched chunks.** Rejected: a second media pipeline for MP3 to solve a gap that a
  prefetched blob already closes, and it gives up the browser's own buffering.
- **Play only from a kept sura, so a network stall cannot interrupt.** Rejected: it turns a first
  listen into a download gate, which ADR-0083 explicitly refused. The prefetch buys the same
  interruption-free transition on a streamed sura for the cost of one Ayah of data.
- **Per-sura artwork.** Rejected: 114 assets for a surface that shows for seconds, and text on the
  artwork competes with the title the system already draws. One cover carries the brand; the metadata
  carries the sura and the Ayah.
- **Resume playing on launch.** Rejected: browsers block it without a gesture, and the times it works
  are the times the phone starts reciting in a pocket.
- **A separate "continue to the next sura" setting.** Rejected for now: the recitation is one
  continuous reading, and a reader who wants one sura stops at its end. A setting can be added without
  changing the engine.

## Consequences

- The first press still streams the first Ayah; the second is fetched immediately afterwards, so a
  metered connection spends one Ayah it may never play. That is the price of the transition, and it is
  smaller than the sura-sized download ADR-0081 already allows.
- The prefetch is a CORS `fetch` to the audio host, which ADR-0081 already allowed in `connect-src`,
  and it plays from a `blob:` URL, which the same ADR allowed in `media-src`.
- A kept sura keeps playing offline: `loadPlayableSurah` falls back to the stored manifest and
  `audioPlaybackSource` to the stored blob, and the engine tolerates a missing edition by keeping the
  last known bitrate (the element's real durations correct the estimate).
- The keep moved from the float to the provider, so leaving the reader no longer abandons a download the
  reader had started. It still starts on play, never on a metered connection, and still says nothing
  when it is skipped (ADR-0083's amendment).
- The web engine cannot keep the Android shell alive with the screen off. That gap is real and is PR 2's
  subject; until then the shell is improved — it survives navigation, and it no longer depends on the
  page's timers for the current file — but not fixed.
- iOS is web-only: Media Session plus a persistent element works on a device, and a native iOS shell is
  a separate decision.
- The reader's markup is unchanged except that the float is a client view rather than the owner, and the
  tests pin the new shape: a prefetched second Ayah, the bar on another page, Media Session metadata,
  and a paused restore after a reload.
