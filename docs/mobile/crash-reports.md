# The app reports its own failures

The native client is the one client with no console. A broken page has a network
tab, a Sentry SDK and a person who can open the site and watch it fail; an APK
has a ring buffer that the next launch overwrites. So the app sends what happened
to it — a crash, an ANR, or a background drain that ended owing work — to the same
Sentry project the web writes to, and this page is where a person looks
([#667](https://github.com/royaraqamia/royaraqamia/issues/667),
[ADR-0115](../adr/0115-the-app-reports-its-own-failures.md)).

## Where to look

| What                            | Where                                                            |
| ------------------------------- | ---------------------------------------------------------------- |
| The issue stream                | Sentry, fingerprint `app-failure/<kind>/<reason>`                |
| One release's reports           | Sentry tag `app.shell` (`1.0.21`) and `app.shell.code` (`20021`) |
| One contract generation         | Sentry tag `app.contracts` (twelve hex characters)               |
| A single receipt, no Sentry     | Vercel logs, `[app-failure]` — one line per accepted report      |
| The app's own queue, on a phone | `adb shell run-as com.royaraqamia.app ls files/app-failures`     |

A report is filed as a **message**, not an exception: what arrives is the app's
own text, and handing Sentry a frame list it would symbolicate against the
server's source would be a lie about what the frames are.

## What arrives

Every report names the release it came from — the shell's version name and
version code, which is what the update channel compares — and the contract
generation the APK was compiled against (a hash of the generated contract files,
`android/.../contracts/generated/ContractGeneration.kt`). That pair is what makes
a report attributable to an APK rather than to "the app": the site moves on, the
APK does not, and `app.contracts` says which schemas that binary speaks.

| Kind    | Reason        | What it means                                                       | Next step                                                           |
| ------- | ------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `crash` | `uncaught`    | A Java exception reached the process's handler. Frames, no message. | Retrace with the release's `mapping.txt`                            |
| `crash` | `native`      | The platform's exit history saw a native death (no frames)          | Tombstone / Play console                                            |
| `anr`   | `anr`         | The process was killed for not answering                            | Look at the frame that blocked, if reported                         |
| `drain` | `no-session`  | The refresh was refused; the queue waits for a sign-in              | Check the session/refresh path                                      |
| `drain` | `refused`     | The server said no to a queued write it was sent                    | The app sends a body the contract no longer accepts — a release bug |
| `drain` | `abandoned`   | The attempt budget ran out with work still owed                     | Writes are still queued; the floor re-arms them                     |
| `drain` | `unreachable` | Attempts were made, nothing was refused, work is still owed         | The least alarming class: a trend, not an incident                  |

A `drain` report carries two counts — `pending` and `failed` — and nothing else.
It is a warning, not an error: nothing is lost, because the rows stay in the
queue.

## What is deliberately not collected

This list is the feature's design, not its caution:

- **No exception message.** A `Throwable`'s message is written by whatever threw
  it, and can hold a URL with its query string, a row's contents, or a token a
  server echoed back.
- **No token, no session, no user id, no device id.** The report route needs no
  bearer at all — the state it reports on is often the state that lost the
  session.
- **No row contents, no endpoint, no URL.** A failed drain says a class and two
  numbers.
- **No free text anywhere.** The signature is a class name or one of the
  contract's own words, the frames are `class.method(file:line)` or they are
  dropped, and the schema's own patterns refuse a space (a sentence) and a `?`
  (a query string).
- **No IP stored.** The address is read to spend a rate-limit bucket and is not
  part of the report.
- **No source file name.** `-renamesourcefileattribute` keeps it out of the APK;
  a retrace needs the mapping, not the path.

The frames are capped at 16 and the queue at 20 reports, 14 days. Those bounds are
what keeps a boot loop from becoming a full disk and a thousand issues.

## Retracing a release

The release build is minified ([ADR-0094](../adr/0094-the-release-build-is-minified.md)),
so a frame names an obfuscated class and method. `proguard-rules.pro` keeps
`SourceFile,LineNumberTable`, which is what lets the mapping say which line of
which method a frame is, and R8 writes the mapping beside the build:

```
android/app/build/outputs/mapping/release/mapping.txt
```

Keep that file with the APK it belongs to. The release train already does: it is
attached to the GitHub release as `mapping-<version>.txt` beside the APK. A report
whose mapping is gone is a report with a class name and no line — the failure this
feature exists to end, one step further along.

## Verifying it

```bash
npm run android:crash-drill      # debug build, one connected device
```

The drill installs a debug APK, clears the app's data, starts
`CrashDrillActivity` (which throws 1.2 s after its first frame), waits for the
process to die, and reads the queue back with `run-as`. It fails unless the report
it finds is an uncaught crash from the release the APK was built with and names a
contract generation. Delivery is not asserted there — the queue is the app's own
promise — but `FailureDeliveryTest` pins what each answer means: `2xx` sends and
removes, `429`/`5xx` keeps and retries, any other `4xx` drops the report so a body
the server will never accept cannot block the queue.

A deliberate crash exists only in a debug build: `CrashDrillActivity` lives in
`android/app/src/debug`, and a release APK contains neither it nor a way to ask
for a crash.

## What it does not do

- **No ANR below API 30.** The exit history arrived with `ApplicationExitInfo`
  (R); below it the app reports only the crashes it caught.
- **No native stack**, only the class: a tombstone is the platform's, not the
  JVM's.
- **No foreground drain reports.** A drain the screen performs already shows the
  sync pill to a person who is looking; the reports are for the path that runs
  with nobody watching.
- **No self-repair.** Nothing here retries a failed write or restarts a screen —
  the queue's own rules do that, and this is the evidence they did not.

## Where the code is

| Piece                                             | File                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| The handler, the exit history, the queue's writer | `android/app/src/main/kotlin/com/royaraqamia/app/failure/FailureReporter.kt`                   |
| What a report may say                             | `.../failure/FailureReportFactory.kt`                                                          |
| The queue on disk                                 | `.../failure/FailureQueue.kt`                                                                  |
| Delivery and its work item                        | `.../failure/FailureDelivery.kt`                                                               |
| Why a drain failed                                | `.../failure/DrainFailure.kt`                                                                  |
| ANR and native deaths                             | `.../failure/ExitHistory.kt`                                                                   |
| The process entry point                           | `.../RoyApplication.kt`                                                                        |
| The body's contract                               | `shared/contracts/app-failures.ts`                                                             |
| The route, the sink                               | `backend/controllers/app-failures.ts`, `backend/services/observability/app-failure-service.ts` |
