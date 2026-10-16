# The shell's dialogs look like the product

ADR-0043 made the update announcement native, and it was right to: the page cannot be relied on to
carry it, because on the WebViews this app meets the Capacitor bridge is injected through a proxy that
a single failed request takes with it. But "native" arrived as an `AlertDialog`, and an `AlertDialog`
is drawn in the **device's** alert style rather than this product's. So the shell's two most
consequential moments — here is a new version, and here is nine megabytes arriving — were rendered as
a grey platform panel with whatever accent the theme happened to resolve, sitting on top of a site that
is violet and navy. It read as a dialog from another app. This is what it is instead.

**The dialogs are ours, painted from the site's tokens.** `ShellUpdatePrompt` builds a `Dialog` with
its own theme (`Theme.Royaraqamia.Dialog`), its own two layouts, and drawables that spell out the card,
the buttons and the bar. The values are not chosen here: they are `app/global.css`'s `:root` tokens
restated in `res/values/colors.xml`, each with the CSS declaration it came from written above it. That
is why the card is `background` (`#121216`) with a hairline `border/60` edge and a 24dp radius rather
than a lighter "panel" grey, and why the primary action wears the Hero CTA's
`linear-gradient(120deg, #8b5cf6, #7c3aed, #6366f1)` — the same fill the site's own update prompt
reuses at the prompt's own size. One product, one palette, and the dialog and the page behind it are
demonstrably the same colour rather than two similar ones.

Two details of the platform's dialog are deliberately not kept. The text is **centred**, which is what
the site's own dialogs do on a phone (`text-center sm:text-left` in `primitives/alert-dialog.tsx`) and
what these lines want: a headline, one sentence and one line of numbers, none of them long enough to
need a ragged edge to read as a block. And the **primary sits above the secondary**, which is the
site's own mobile footer (`flex-col-reverse`): on a card this narrow the gradient action gets the full
width to itself instead of half a row.

Both actions are pills, and only one of them is drawn. The primary is the CTA's gradient at a 24dp
radius — half the 48dp the layouts give it, so the corners are semicircles — and the secondary is its
label alone: no fill and no edge, in `muted-foreground`. It began as the site's `outline` button
variant, and the outline is what made it read as a box arguing with the pill above it. The label
carries the action on its own.

The Arabic is vowelled where the marks disambiguate and nowhere else: the shadda on «التَّطبيق»,
«التَّحديث», «التَّنزيل» and «الاتِّصال», the fatha on «ثمَّ», and «جاري» in place of the tanween in
«جارٍ». That is a reading aid rather than decoration, so the sentences around those words stay
unvowelled — as they already were.

**The shell is dark-only.** `AppTheme` was `Theme.AppCompat.DayNight.NoActionBar`, and the dialog it
hosted was the platform's — so on a phone in **light** mode the shell drew a white card on top of a
site that renders dark unconditionally (`app/global.css` declares its tokens in `:root`, not under a
`.dark` class, and there is no light set to switch to). Nothing about this app follows the system
theme, and the one surface that did was the one with a decision in it. Both themes are now dark.

`AppTheme`'s `colorPrimary`/`colorPrimaryDark`/`colorAccent` also pointed at `@color/colorPrimary` and
friends, which this repository has never defined. They resolved out of a dependency that happens to
ship those names, which is why nothing ever failed loudly. They now name the brand.

**IBM Plex Sans Arabic ships inside the APK.** The site's body face is Plex (`frontend/shared/fonts.ts`,
`--font-arabic`), and the dialog is drawn over a WebView that is set in it — so a dialog in the
system's Arabic face is a visible seam down the middle of one screen. `res/font/` now carries Regular
and Bold, converted once from the same `.woff2` files the site already ships (`fontTools`, because
Android has no WOFF2 support and the repository had no TTF). They cost 344KB in a 9MB APK. On API 24
and 25 `android:fontFamily` naming a font resource resolves through AppCompat, which is why every view
in these layouts is inflated from the activity's own `LayoutInflater`; where that ever stopped being
true the text falls back to the system face instead of failing.

**The download can be stopped.** It could not before, on purpose: the file was being written, and
backing out would leave "a file nobody asked about" (ADR-0044). That objection is now answered rather
than worked around. «إلغاء» sets a flag, and the flag is read by the progress callback — which runs on
the thread that is reading the socket, so throwing from it unwinds `fetch` through the failure path
that already existed for a truncated body. The partial file is deleted by exactly the code that
deletes it for a truncation; there is no second cleanup path to keep correct. Cancelling the `Future`
instead would not have worked: `InputStream.read` on an `HttpURLConnection` does not answer an
interrupt, so the bytes would have kept arriving on a thread nobody was listening to.

The dialog is still not dismissable by back or by an outside tap. An interrupted install is worse than
a slow one, so the only exit is a gesture that means it — and now there is one.

**What the card says.** The offer adds a single muted line: «تحديث من 1.0.2 إلى 1.0.4 · 7.1 م.ب», from
`versionName` and `sizeBytes` in the manifest — both of which the manifest already published, and one
of which (`sizeBytes`) is load-bearing for the verification regardless. Either half may be missing and
either may stand alone, because a manifest published by hand can leave out either and an empty row is
worse than no row. It is phrased «من … إلى …» rather than `1.0.2 → 1.0.4` because inside an RTL
paragraph the arrow's direction reverses: the same characters read as a downgrade on half the devices.
The progress card carries the percentage on the row under the bar, at the end the reading starts from,
and the size at the other: «22%‎ … 6.6 من 30 م.ب». The size is `sizeBytes` to one decimal place, with a
tenth that is always zero dropped — a 30MiB download says «30», not «30.0», because a zero tenth is
noise in a sentence about how big something is.

**A failed download is a state of the same card, not a toast.** The old flow was a toast that floated
away followed by the offer coming back, which is the same decision asked twice with the reason for the
first attempt gone. Now the reason replaces the sentence, «إعادة المناولة» —
«إعادة المحاولة» — replaces the action, and «لاحقًا» still declines. A shell the site has marked
unsupported keeps its undismissable offer, but its _failure_ card is dismissable: a failing connection
must never leave a user holding a dialog whose only button retries it.

## Considered Options

- **Keep `AlertDialog` and brand it through theme attributes.** The smallest diff: define the colours,
  set `alertDialogTheme`, stop. Rejected because what an `AlertDialog` will let you change is its
  accent and its surface — not its layout, not its button shapes, not its type. The gradient action,
  the stacked footer and the meta line are most of what makes the card this product's.
- **`MaterialAlertDialogBuilder`.** Less custom code, a well-tested shape, and the platform's own
  typography and motion. Rejected because it adds `com.google.android.material` and its theme plumbing
  to a shell that has avoided dependencies on purpose, and because a Material 3 card is recognisably
  Material 3 — the same complaint as the platform dialog, one generation later.
- **A notification instead of a progress dialog.** Revisited from ADR-0044, which rejected it when
  the download "lasts seconds". Still rejected, and the reason is now the honest one: the download
  dies with the activity (`onDestroy` shuts the executor down), so a notification would be advertising
  a download that a low-memory destruction quietly ends. Making it survive would mean a foreground
  service, a channel and a permission on Android 13+ — a real piece of work, and not one to smuggle in
  behind a redesign.
- **Aref Ruqaa, the site's display face, on the dialog title.** More distinctive, and the site does own
  the font. Rejected because the site's own dialogs do not use it: `DialogTitle` is Plex Bold, and
  Aref Ruqaa is reserved for the marketing headings. Using it here would have been a louder match than
  the product itself makes.
- **Let the download continue while the user leaves the app.** The most obvious reading of "don't
  block me". Rejected on inspection rather than taste: the executor is owned by the prompt, which is
  owned by the activity, so the download stops when the activity does — the version that ships today
  would have been a lie about what happens next. See the notification option above for what making it
  true would cost.
- **Loading the brand faces from `assets/` with `Typeface.createFromAsset`.** Works on every API level
  with no backport question. Rejected as more code for the same result: `res/font` plus AppCompat's
  own resolution covers API 24, which is `minSdk`, and a `Dialog` in an `AppCompatActivity` inflates
  AppCompat views already.

## Consequences

`npm run android:test` covers 31 cases across the manifest and the download, up from 25. Two of the new
ones are the cancel: that a download stopped from the progress callback leaves the directory exactly as
empty as a truncated one does, and that a callback which cancels during the cheap "already verified"
path does not take the verified file with it. The third is the size's arithmetic — «7.1» keeps its
tenth, «30» and «0» do not. Whether the card _looks_ right is not something a JVM test can hold, and
the drill is what said so: the API 30 image, en-US, 320dp wide, shell at `20005`, a manifest at `20099`,
an APK served at 300KB/s so the bar stayed up. It is also what caught the two defects this change would
otherwise have shipped — a layout that took its direction from the phone, and a headline that shared its
line with the percentage and wrapped.

The fonts are binaries in the tree with no regeneration step, which is worth naming: they were
converted once from `public/fonts/IBM Plex Sans Arabic/*.woff2` with `fontTools`, and if the site
changes its body face nothing here will notice. The `colors.xml` tokens have the same shape of
problem and the same mitigation — the CSS declaration each one came from is written beside it.

This is also the change that stops `@color/colorPrimary` resolving out of a dependency. A tree with
`android/**` in it never showed the difference, which is the point: it was a resource nobody would
have thought to look for.

Nothing about the _decision_ ADR-0043 made moves: the announcement is still native, still asks at most
every six hours and on a fresh launch, still has no «لاحقًا» for a shell the site has marked
unsupported, and the page still stays quiet from its own user agent while this is pending. What
changed is what it looks like when it arrives, and that a download can now be refused at the point of
doing rather than only before it.
