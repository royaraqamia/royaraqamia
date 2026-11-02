# The app reports its own failures

[#667](https://github.com/royaraqamia/royaraqamia/issues/667) gives the native client the one thing
the web has had since the beginning: a way to say it broke. A page that fails leaves a Sentry event, a
console line and a network tab; an APK that fails leaves a ring buffer that the next launch
overwrites, and a support message that says "the app closes". This records what was built, what is
deliberately not collected, and why the alternatives were refused.

## The decision

- **The report is a contract, generated like every other.** `shared/contracts/app-failures.ts` is the
  body; `npm run contracts:generate` writes `AppFailureContracts.kt`, so a field the server stops
  accepting is a compile error in the app rather than a `400` from a phone nobody is watching.
- **Three kinds, one closed reason list each.** `crash/uncaught`, `crash/native`, `anr/anr`, and
  `drain/{no-session,unreachable,refused,abandoned}`. The reason is a class, not a sentence: a new
  class is a schema change, so the set cannot drift into free text.
- **A crash carries frames and a class name, never a message.** The message is written by whatever
  threw and can hold a URL with its query string, a row's contents or a token a server echoed back.
  A frame is `class.method(file:line)` or it is dropped, and the contract's pattern has no space and
  no `?` — a sentence and a query string are structurally unable to travel as one.
- **A drain carries a class and two counts.** No row, no endpoint, no payload.
- **The release is named twice.** `shell.name`/`shell.code` are the version the update channel
  compares, and `contracts` is a hash of the generated contract files
  (`ContractGeneration.kt`, written by the generator). The site moves on; the APK does not, so a
  report says which schemas that binary speaks.
- **No session is spent.** The app posts through `HttpTransport` directly, not `ApiClient`: every
  `ApiClient` call needs a bearer, and the state being reported is often the state that lost the
  session. The route is public, rate limited fail-closed at 30/minute per IP, and bypasses the update
  floor — the build most likely to crash is the one below it.
- **A crash is durable before the process dies, and delivery waits for the radio.** The handler writes
  a file (no database to open, no transaction that can block on a lock the crashing thread held) and
  WorkManager sends it with a `CONNECTED` constraint, so a crash in a tunnel is reported when the
  tunnel ends without the app being reopened.
- **The platform's exit history is read for what the handler cannot see.** `ApplicationExitInfo`
  (API 30+) supplies ANRs and native deaths; `REASON_CRASH` is deliberately not mapped, because the
  handler already filed it and a mapping would file every Java crash twice.
- **The launch pays almost nothing.** `RoyApplication` installs the handler (a field assignment) and
  everything else runs on its own thread: the cold budget is 550 ms on the reference phone
  ([native-app.md](../mobile/native-app.md)).
- **Sentry gets a message, not an exception.** One issue per class
  (`fingerprint: ['app-failure', kind, reason]`), tagged with the release and the contract
  generation. Handing Sentry the app's own frames as an exception would invite it to symbolicate them
  against the server's source.
- **A release keeps its line numbers.** `proguard-rules.pro` now keeps `SourceFile,LineNumberTable`
  and renames the source file, so a minified frame can be retraced against the mapping R8 writes
  beside the build ([ADR-0094](0094-the-release-build-is-minified.md)). The mapping is not
  committed; `android-release.yml` attaches it to the GitHub release as
  `mapping-<version>.txt`, and [crash-reports.md](../mobile/crash-reports.md) says how to read it.

## What is deliberately not collected

The list is the design: no exception message, no token, no session, no user id, no device id, no row
contents, no endpoint, no URL, no free text, no IP stored (it is read to spend a rate-limit bucket and
dropped), no source file name. The queue holds at most 20 reports for at most 14 days, and a report
carries at most 16 frames. A boot loop is therefore a bounded amount of disk and a bounded number of
issues.

## What this costs

- **A report without its mapping is half a report.** Frames name obfuscated classes; the line numbers
  only become a line of code through `mapping.txt`. The release train has to keep that file, and this
  ADR is the reason it exists.
- **The endpoint is public by necessity.** Anyone can post a report. The blast radius is a rate
  limit, a schema and a Sentry project; nothing is stored, nothing is executed, and no identity is
  read.
- **ANRs are invisible below API 30.** There is no platform history to read there, so an old device
  reports only what it caught.
- **A native death has a class and no stack.** The tombstone belongs to the platform.
- **A foreground drain is not reported.** The screen already shows the sync pill to a person who is
  looking; the reports are for the path that runs with nobody watching.

## Why not the alternatives

- **Firebase Crashlytics.** A Google dependency, a second identity for the release, and a console
  beside Sentry that the web's failures never reach. The project already has a Sentry release and a
  Vercel log line; adding a third place to look is the opposite of the ticket's "somewhere a person
  looks, next to the web's".
- **The Sentry Android SDK.** It is the right tool for a project that does not have one, and the
  wrong one here: it drags an SDK, an init and a release-naming scheme into an APK whose budget is
  measured in tens of milliseconds, for a report the app can write in twenty lines and post to a
  route it already has.
- **Report everything.** A full stack trace, the exception message and the failing URL would be
  easier to debug and would make the report a copy of what the process knew. The ticket's own
  criterion — "a failed drain reports a reason class only: no token, no row contents, no URL with a
  query string" — is the line, and the crash path holds it too.
- **Let the screen drain report itself.** A user watching a pill does not need a Sentry issue; a
  background worker with nobody watching does.
