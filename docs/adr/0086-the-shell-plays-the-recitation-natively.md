# The shell plays the recitation natively

ADR-0085 gave the recitation one engine per document, a prefetched queue and a Media Session. In a
browser that is enough: a page that is playing audio is not suspended. In the Android shell it is not.
`BridgeActivity.onPause` pauses the WebView — its timers, its renderer and its JavaScript — so the Ayah
that is playing finishes and the callback that would start the next one never runs. The pause users saw
"after some time" with the screen off was not a network failure; it was the queue's only driver being
frozen.

The shell also had no media session, so the platform had nothing to draw: no notification, no lock
screen, no media keys. The page could not fix either problem from inside the WebView.

## The decision, in seven parts

1. **A media3 `MediaSessionService` owns playback.** `QuranPlaybackService` holds an ExoPlayer and a
   Media Session; the queue, the seek bar and the system's Play/Pause, Stop, previous/next and
   lock-screen controls are the platform's. The player uses a wake mode and audio focus, pauses on a
   becoming-noisy route, and `stopWithTask=false` keeps the stream alive when the app is swiped away.

2. **One sura at a time, continued by the service.** The service loads a sura's manifest, builds one
   `MediaItem` per Ayah (the kept file when the device has it, the CDN URL otherwise), and plays it.
   When the last Ayah ends — or the notification's next is pressed there — it adopts the next sura's
   items, which it prepared in the background. An-Nas is the end. The page cannot be asked to do this:
   it is exactly the JavaScript that is frozen.

3. **The page is a controller, not a player.** A Capacitor plugin (`QuranPlayer`) talks to the service
   through a media3 `MediaController`: play, pause, seek and the two track skips are the session's own
   commands; `loadSurah`, `keep`, `keepState` and `stop` are this app's custom ones, advertised in
   `onConnect`. State flows back as a `state` event shaped exactly like the web engine's, so the float
   and the mini player do not know which engine is playing. `state()` is the resync a frozen WebView
   calls when it returns; the plugin's ticker supplies the once-a-second progress while it is awake.

4. **The keep moves into the shell.** The service downloads a sura into app storage while it plays:
   the same content-addressed key, the same sha256 gate and the same 128 MiB least-recently-used budget
   the web store uses (ADR-0081), written into `quran-audio/` with an index and a `.part` rename. A
   metered connection skips it silently, as ADR-0083 requires; a keep asked for while another is
   running waits its turn. The page's keep command starts it and polls its progress; the service's own
   keep starts on load, so a page that goes away does not stop it.

5. **The last position lives in the shell.** SharedPreferences holds the sura, the Ayah and the offset
   while the service runs and after the process dies. A cold start restores it paused; when a service
   is still playing from the background, the plugin connects and the saved record becomes the live
   state on the next event, so the page shows what is actually playing instead of restarting it.

6. **The engine is chosen at start-up.** `recitationPlayer()` returns the native player when the
   plugin is present and the web engine otherwise. A missing bridge — the upstream Capacitor case
   ADR-0043 measured — degrades to the web engine instead of a dead control. In the shell the web
   engine is not created at all, so there is no second audio element to double-play.

7. **The shell's web code is the live site.** The plugin is native, but the controller that uses it
   ships with the web build; an installed shell picks it up on the next page load. Only a change to the
   service, the plugin or the media dependencies needs a new APK (and the shell counter to move).

## Considered options

- **A foreground service that keeps the WebView alive.** Rejected: `WebView.onPause()` is what pauses
  the renderer, and there is no supported way to keep a background WebView's timers running. A service
  that nudges it with `onResume` is a race, not a guarantee, and it still gives the platform no
  notification.
- **A single long file per sura.** Rejected in ADR-0062 and still: it would make the queue native by
  accident, at the cost of a sura-sized download before the first Ayah and an Ayah that is no longer
  the file being played.
- **media3's cache instead of a verified store.** Rejected: `CacheDataSource` stores what it streamed,
  with no sha256 gate, no per-sura "complete" answer and a byte-based eviction order. The reader was
  promised a copy checked against the manifest, and the web already keeps one that way.
- **Let the page append the next sura.** Rejected: it is precisely what a frozen page cannot do.
- **Hard-code the production origin in the service.** Rejected: the emulator build points at a local
  server (`CAPACITOR_SERVER_URL`), and the manifests are public files under that origin. The page
  passes `window.location.origin`; a debug-only manifest allows cleartext for that case.
- **Use the page's OPFS copy for native playback.** Rejected: the WebView's origin-private storage is
  not a file the service can open. The two stores are independent, and the shell's is the one its
  player reads.
- **A custom notification layout to put our own small icon in place of media3's glyph.** Rejected for
  this PR: the artwork and the title carry the identity, and a hand-written notification provider is a
  second layout to keep in step with media3. It can be added without touching the player.

## Consequences

- The shell counter moves (20018) and a release has to be signed; this machine has no keystore, so the
  build that was verified here is a debug APK plus the JVM tests. The on-device pass — play, screen
  off, swipe, notification controls — is the owner's.
- The manifest gains `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK` and
  `ACCESS_NETWORK_STATE`; `POST_NOTIFICATIONS` was already there. A device that refused notifications
  still plays, but the shade has no controls until it is granted.
- The media notification's channel is `quran_playback` (low importance), its artwork is the one cover
  from ADR-0085, and its small icon is media3's glyph.
- The shell's copies are in app storage, not the WebView's OPFS. A sura kept by an older shell is not
  seen by the native player and is downloaded once more; the old OPFS pool stays as dead weight until
  it is cleared.
- A keep runs while the service lives: playing, or paused while the app is still around. Swiping the
  app away while playing keeps both the stream and the keep; a stopped player takes the io executor
  with it.
- The notification's next/previous go through `onPlayerCommandRequest`, which is where the sura
  boundary lives; the page's next goes through the same path, so both controls agree.
- The JVM tests cover the manifest reader and the store (hash refusal, reuse, LRU eviction, offline
  cache); the service, the notification and the controller are media3's and are covered by the
  on-device pass.
