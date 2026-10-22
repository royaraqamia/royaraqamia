# رؤيَة رقَميَّة (royaraqamia)

The public site and the product family it hosts. This glossary fixes the vocabulary
shared across the Community, Certificates, Consultations, Training and Client Work offerings,
so the same concept is not named three different ways in code, copy and the admin UI.

## Language

### Training

**Training**:
The teaching offering as a whole, and the namespace the site exposes it under.
A Training may contain more than one Course; today it contains one.
_Avoid_: Academy, bootcamp, school

**Course**:
A single taught programme that a student applies to — the thing with a title, a
trainer, a price and a duration.
_Avoid_: Class, workshop, programme, module

**Cohort**:
A dated intake of a Course: a fixed start date and a fixed number of seats. Seats are
the only scarce resource in the training offering, and a Cohort holds them.
_Avoid_: Batch, group, class, intake, round, session

**Application**:
A prospective student's request to join a Course, optionally naming the Cohort they
want. It is a lead: it involves no payment, and it holds no seat until it is enrolled.
_Avoid_: Registration, enrollment, booking, signup

**Enrollment**:
The act of moving an Application into a Cohort, which claims one of that Cohort's
seats and is the only thing that consumes capacity. Seats are claimed by an operator,
never by the applicant.
_Avoid_: Booking, registration, admission, signup, reservation

**Application Status**:
Where an Application sits in the operator's follow-up. `enrolled` means the applicant
was accepted and a seat in a Cohort was claimed for them; it does not mean payment.
_Avoid_: Booking status, payment status, order status

**Reference Code**:
The short human-readable identifier an applicant quotes on WhatsApp. It identifies an
Application and is deliberately not a secret.
_Avoid_: Tracking number, ticket, booking ref

### Community

**Community Post**:
A published article in the public feed, rendered from Markdown. Authored by a
signed-in User and readable by anyone.
_Sold as_: المجتمع
_Avoid_: Blog post, article, entry

**Community Category**:
A User-owned grouping of Community Posts. Private to its owner until a post in
it is published, then visible on the public feed.
_Avoid_: Blog category, section, topic

**Community Tag**:
A User-owned label attached to Community Posts for discovery.
_Avoid_: Blog tag, keyword, label

### Certificates

**Certificate**:
Proof that a named student completed a named course.
_Avoid_: Diploma, credential, badge

**Certificate Code**:
The public identifier a Certificate is looked up by. Anyone holding it may verify the
Certificate.
_Avoid_: Verification ID, serial

### Consultations

**Consultation Booking**:
An anonymous, unpaid request for one or more Availability Slots. Unlike an
Application it holds scarce inventory until an operator confirms or rejects it, but
it requires no account and takes no payment.
_Avoid_: Appointment, meeting, session, application

**Availability Slot**:
A single bookable window of time. Only one active Booking may hold a Slot.
_Avoid_: Time slot, timeslot, meeting time

**Booking Reference**:
The short code (`CONS-2026-A7K2M9QX`) a booker quotes on WhatsApp. It plays the same
role as an Application's Reference Code and is likewise not a secret.
_Avoid_: Booking ID, ticket, tracking number

### Client Work

**Client**:
The person or company on the other side of a Project Request or a Retainer. Distinct from
a User: a Client needs no account.
_Avoid_: Customer, buyer, account

**Project Request**:
A prospective Client's request to have a project built — a lead with its own reference
code and no payment.
_Sold as_: طلب بناء مشروع
_Avoid_: Project inquiry, build application, order

**Retainer**:
A monthly arrangement in which royaraqamia maintains, fixes, improves or manages a
Client's own projects for a fixed monthly fee. It begins as a lead and becomes an
arrangement only when an operator activates it.
_Sold as_: التَّعاقُد الشَّهري
_Avoid_: التوظيف, Employment, employee, salary, subscription, maintenance contract

### Showcase

**Portfolio Item**:
A published sample of royaraqamia's work, shown on the site as a showcase.
_Avoid_: Project, case study, work sample

### Media Downloader

**Media Downloader**:
The public tool that turns a link to a Platform-hosted media item into a single audio
or video file a visitor can save. Free and anonymous; it is a traffic utility, not a paid
offering. Distinct from the act of saving a file on a device.
_Sold as_: مُنزِّل الوسائط
_Avoid_: Downloader, download tool, saver, grabber, ripper

**Download**:
One request to turn one media link into one saved file — the unit of work in the Media
Downloader. It carries a content choice (audio or video) and produces at most one file.
_Avoid_: Save, grab, rip, export, conversion

**Download Job**:
The short-lived record of a Download, tracked from acceptance to delivery. It is rate-limited,
observable and reviewable by an Admin, but stores no media.
_Avoid_: Task, request, transfer, conversion job

**Download Status**:
Where a Download Job sits in its short life: `queued` (accepted, not yet started),
`running` (the Media Provider is working), `ready` (a signed file link exists) and the
terminals `failed` and `expired`.
_Avoid_: State, stage, phase

**Platform**:
An external site whose hosted media a Download can target. Each Platform can be enabled or
disabled independently of the others.
_Avoid_: Source, host, site, service, provider

**Circuit breaker**:
Per-Platform safety that opens when a Platform's extractor keeps failing, refusing new
Downloads for that Platform until a cooldown passes.
_Avoid_: Rate limiter, throttle, backoff

**Blocklist**:
The domains and exact links an Admin has refused; a Download targeting one is rejected
before any provider work.
_Avoid_: Ban list, denylist, blacklist

**Download Limits**:
The tunable caps — max duration, audio/video size, concurrent jobs and signed-link
lifetime — an Admin can change without a deploy.
_Avoid_: Quotas, thresholds, config

**Media Provider**:
The external backend that turns a media link into a downloadable file. The site does not
extract or convert media itself.
_Avoid_: Extractor, downloader service, ripper

### Scanner

**Scanner**:
The public tool that reads a QR or barcode held in front of the camera, or present in an
uploaded image, and reports what it contains. Free and anonymous; a traffic utility, not a
paid offering. Distinct from a Certificate Code lookup, which asks about one known identifier.
_Sold as_: ماسح QR و Barcode
_Avoid_: QR reader, barcode app, decoder

**Scan**:
One act of reading one code with the Scanner, from the camera or an image. It is complete the
moment a payload is read: it is not a lookup, and it stores nothing.
_Avoid_: Read, capture, decode, query

**Scan Result**:
What a Scan produced — the decoded payload together with the type the Scanner detected for it
(link, email, phone, WiFi, contact, location, one-time password, or plain text). It is
transient: it lives only in the page, never on the server and never on disk.
_Avoid_: Output, decoded value, reading

### Exchange Rates

**Currency**:
A national fiat money, identified by its ISO 4217 code, that the site can quote and convert.
One of the full ISO 4217 set, not a curated list. Distinct from a Metal.
_Avoid_: Money, coin, cash

**Metal**:
Gold or silver, priced as a commodity rather than issued by a country. Modelled apart from
Currency because it is quoted and sold in different units — troy ounces, grams and karats.
_Avoid_: Commodity, bullion, precious metal

**Exchange Rate**:
The value of one Currency expressed in another as published by an external provider on a
given date. It is a quoted observation, not an offer, and no money moves through it (ADR-0006).
_Avoid_: FX rate, conversion rate, price

**Reference Rate**:
The value of one Currency in another as blended by the external reference feed, which
republishes many official sources rather than one central bank. It is the board's fallback
when no dedicated source exists, and the only rate shown for a Currency that is not dual-rate.
_Avoid_: Official Rate, market rate, true rate

**Official Rate**:
The value of one Currency in another as administered or pegged by that country's central
bank, shown on the board as the rate banks and the state use. One half of a dual-rate Currency,
and distinct from the Reference Rate, which is a third-party blend.
_Sold as_: السِّعر الرَّسمي (المصرف المركزي)
_Avoid_: central bank price, government rate, official price

**Parallel Rate**:
The value of one Currency in another on the informal market, where it diverges structurally
from the Official Rate. Shown beside the Official Rate for a dual-rate Currency, and never
averaged with it.
_Sold as_: السُّوق الموازي
_Avoid_: black market, السُّوق السوداء, street rate, free-market rate

**Metal Price**:
The spot value of a Metal for a given quote date, stated in USD per troy ounce. Gram and karat
figures are derived from it, never stored as their own rates.
_Avoid_: Gold rate, bullion price

**Base Currency**:
The single Currency that every Exchange Rate in a Rate Snapshot is quoted against. Today it
is USD.
_Avoid_: Reference currency, anchor currency

**Rate Snapshot**:
The complete set of Exchange Rates and Metal Prices captured from the provider at one moment,
stamped with both when it was fetched and the provider's own quote date. The page's history is
a sequence of Rate Snapshots.
_Avoid_: Sync, reading, quote, feed

**Rate Sync Run**:
One attempt to capture a Rate Snapshot, recorded with its outcome. It is the operator's record
of whether the feed is healthy, and the page falls back to the last good Snapshot when a run
fails.
_Avoid_: Sync log, job run

### Quran

**Quran Reader**:
The public tool that lets a reader read the Quran Surah by Surah and Ayah by Ayah, listen to a
Recitation, read a Tafsir beside the text, and keep their place. Reading is free and anonymous;
signing in only carries a reader's place to their other devices. A traffic utility, like the
Scanner — not a paid offering.
_Sold as_: القرآن الكريم
_Avoid_: Quran app, Koran, mushaf app, Quran viewer

**Surah**:
One of the Quran's 114 chapters, identified by its number and its Arabic name. The unit a reader
browses by.
_Avoid_: Chapter, section, part, juz

**Ayah**:
One verse of a Surah, and the smallest addressable unit of the text — what a Reading position
points at and what a Recitation is played against.
_Avoid_: Verse, line, sentence

**Riwayah**:
A transmission of the Quranic reading, named for the chain it came through. The Quran Reader
offers exactly one — Hafs ʿan ʿAsim — so the term names the choice rather than an option a reader
picks.
_Avoid_: Reading, version, edition, recension, qiraat

**Reciter**:
The person whose recorded voice a Recitation is.
_Avoid_: Reader, shaykh, artist, performer

**Recitation**:
One Surah as recorded by one Reciter, in a single uninterrupted track — the unit a reader plays,
and the only asset fetched from outside our own origin.
_Avoid_: Audio, track, mp3, tilawa, sound file

**Reading position**:
The single Ayah a reader last reached, which the Quran Reader resumes from. A reader has one, not
one per Surah, and it keeps no history of where they have been.
_Avoid_: Last read, progress, cursor, bookmark

**Bookmark**:
A place in the text a reader saved deliberately so they can return to it. Distinct from a Reading
position, which moves on its own as they read and is overwritten every time.
_Avoid_: Favourite, mark, flag, saved verse, starred

**Tafsir**:
A scholarly explanation of the text, read beside an Ayah. The Quran Reader offers one —
التفسير المختصر — and a Tafsir is deliberately not a Translation: the site serves the text in
Arabic only.
_Sold as_: التفسير المختصر
_Avoid_: Commentary, exegesis, translation, footnote, explanation

**Mushaf View**:
The Quran Reader's alternate rendering of the text as it appears on a printed page, preserving the
page and line breaks of the Madani Mushaf. A view over the same text, not a second copy of it.
_Avoid_: Page mode, print layout, book view, مصحف

### Offline

**Offline-first**:
An application property: every feature that logically can work without a network does, and the
network is treated as an optional, asynchronous dependency rather than a precondition.
_Avoid_: offline support, offline mode, PWA

**Local-first**:
The stronger property that a user's own records live in the Local Store and that store is the
source of truth, with the server acting as a sync and backup peer.
_Avoid_: client-first, device-first, sync-first

**Owned data**:
Records a single user authors and controls — habits, expenses, links, drafts — for which the
device is authoritative. Distinct from Shared data.
_Avoid_: user data, private data, local data

**Shared data**:
Read-oriented records the server owns and many users see — the Community feed, Exchange Rates,
Certificates, Availability Slots. Cached for offline reading, but never written from the device.
_Avoid_: public data, global data, remote data

**Local Store**:
The durable, per-identity IndexedDB database on a device that holds a user's Owned data and the
Outbox. It survives service-worker updates and sign-out.
_Avoid_: cache, local cache, offline DB

**Outbox**:
The ordered queue of a user's not-yet-synced writes, held inside the Local Store, replayed to the
server until each is acknowledged.
_Avoid_: write queue, sync queue, pending writes

**Device copy**:
The Local Store databases one identity holds on this device — data and Outbox together — and the
`/device` page that inspects, retries and removes them. Sign-out keeps a copy; that page is how a
shared device drops it.
_Avoid_: local data, cache, account namespace

**Claim**:
The act of attaching a guest's Local Store records to an account on first sign-in, so work done
before signing in is not lost.
_Avoid_: migration, merge, import

**Connectivity state**:
Whether the app is currently online, offline, or mid-sync, surfaced to the user rather than
inferred from a failed request.
_Avoid_: network status, online flag, connection

**Pending change**:
A write that is durable locally but not yet acknowledged by the server. Its count is shown to the
user.
_Avoid_: unsynced, dirty, queued change

**Delivery state**:
The lifecycle of a single write as the user sees it — queued, sent, or failed — shown where the write
lives, not only as a count.
_Avoid_: status, tick, progress

**Background flush**:
A replay of the Outbox that runs with no page open — the service worker under Background Sync on
Chromium, or the Android shell's WorkManager job. It is what makes delivery outlive the app.
_Avoid_: background sync, auto-sync, push sync

**Sync hint**:
A server-to-client signal that there is new Owned data to pull. It triggers a pull and is never itself
the data, so it cannot become a second writer.
_Avoid_: push, realtime event, notification

**Launch screen**:
The stateless first paint the Android shell draws before its WebView has a frame — the app's own chrome
drawn as a skeleton, not a logo. Kept separate from the app so it needs no over-the-air update.
_Avoid_: splash, loading screen, boot screen

**Never-cache list**:
The set of responses the service worker must never store — auth, mutations, admin, push and
anything marked `no-store`/`private`.
_Avoid_: blacklist, do-not-cache, exclusions

**Worker swap**:
The moment a newly installed service worker takes control of a document the previous one served. It
happens once the previous worker's clients are gone, so it lands on a client's next launch (inside the
Android shell, its next cold start) rather than on a refresh. The document replaces itself when it
happens, so a client is never left running a build whose caches `activate` has already deleted
(ADR-0039); while a build is only _waiting_ — downloaded, not yet in control — the page offers it
instead of applying it silently (ADR-0042).
_Avoid_: update, SW update, auto-update

**Shell version**:
The Android shell's own version counter (`android/shell-version.properties`), independent of the site
version, and the number Android itself compares when deciding whether an APK may replace the installed
one. It moves only when the shell itself changes, because the shell loads the live site: a web release
changes nothing about the installed app (ADR-0043).
_Avoid_: app version, build number, versionCode

**Shell update**:
A newer APK published at `public/android/latest.json`, announced by the shell's own native prompt and
installed by it — downloaded into the app's own storage, checked against the manifest's size and
SHA-256, then handed to the system installer, which is what asks the user (ADR-0044). While it is
pending, the site holds its web offer back. Distinct from a worker swap, which is the web build
updating itself within the same install (ADR-0042).

The manifest is stamped from the built APK by `android:publish` and published by the `Shell Release`
workflow on a change to the shell (ADR-0045). It names our own origin —
`https://royaraqamia.com/android/royaraqamia-1.0.3.apk`, which the site rewrites to a Supabase Storage
bucket, because GitHub's release assets are not reachable everywhere this app has users (ADR-0047). Each
version is also its own release — `android-1.0.3`, holding `royaraqamia-1.0.3.apk` as the permanent archive
— because a tag that gets reused can be repointed at other bytes, and the version in the tag is the shell's
own, derived from the counter and never typed (ADR-0046). `Shell version` is that counter; the `1.0.3` is
what a user reads in the app's info screen and in the account footer.
_Avoid_: app update, force update

**Tombstone**:
A soft delete (`deleted_at`) that records a removal so it can sync to other devices without losing
the row's identity.
_Avoid_: soft delete, deleted flag, marker

### MCP

**Connected App**:
An external MCP client (Claude Code, OpenCode, Codex, Cursor, …) that a User has authorized to
reach their data. Each one appears in the account area, where the User can disconnect it without
signing out of the site.
_Sold as_: التَّطبيقات المتَّصلة بالـ MCP
_Avoid_: Integration, plugin, add-on, connector

**Grant**:
One User's authorization of one Connected App — the set of live OAuth tokens that client holds for
them, not a single token and not the OAuth `grant_type` of a request. A Grant is live until it is
disconnected or swept, and disconnecting one leaves the User's other Grants and their site session
alone.
_Avoid_: Permission, consent, access token, connection

### Plans & usage

**Plan**:
What an account may spend and keep: the free plan or the paid plan, either of which reaches
every product. A Plan is an entitlement, not a payment record — money moves off-system and an
operator activates the plan by hand (ADR-0006, ADR-0075).
_Avoid_: Subscription, tier, membership, package

**Credit**:
The unit one metered action spends from the Plan's rolling allowance. Reads are never charged; an
action is. The remaining figure is computed from the ledger, never stored as a balance.
_Avoid_: Quota, token, balance, points

**Allowance window**:
The rolling 30 days a credit spend counts against, floored by the last Activation or by the
moment a paid Plan lapsed. A window has no reset date, only a length — the card reports what is
left now.
_Avoid_: Billing period, cycle, month

**Owned-item cap**:
How many things an account may hold — habits, expenses, short links, drafts, bookmarks, connected
apps. A standing limit checked when a row is created; it is never a monthly charge on saved data,
and lowering it never deletes anything.
_Avoid_: Limit, storage quota, seat

**Activation**:
An operator's deliberate grant of the paid Plan for 30 days, recorded with amount, method, note
and expiry in `plan_activations`. It raises the cap and starts a fresh window. Expiry lowers the
cap and starts a fresh window too.
_Avoid_: Purchase, payment, upgrade, renewal

**Usage card**:
The account page's report of one number: credits spent and remaining in the current window, plus
what the Plan makes available next. It never mixes in Owned-item caps.
_Avoid_: Dashboard, meter, quota bar

**Anonymous allowance**:
A visitor's 10 credits per rolling 24 hours, keyed on a salted IP hash rather than an account.
When it runs out the site offers sign-in — the free Plan — instead of a dead end.
_Avoid_: Guest quota, trial, rate limit

### Shared

**Admin**:
A signed-in user whose email is on the server-side allowlist. Admin is a property of a
person, not a role anyone can be granted from the UI.
_Avoid_: Moderator, staff, editor

**Admin Console**:
The area under `/admin` that an Admin signs into to operate across the product family.
It is the single door to every operator-facing surface.
_Avoid_: Dashboard, backoffice, admin panel, CMS

### Rendering

**Heavy effect**:
A visual effect whose cost is paid on every frame or every scroll frame — blur, glow, motion,
3D transforms. Distinct from a static style, which is paid once when it is first rastered.
_Avoid_: Expensive style, fancy effect, glass effect

**Decorative effect**:
A Heavy effect that a non-per-frame alternative can replace without losing its function — a
backdrop blur that an opaque fill serves just as well.
_Avoid_: Cosmetic effect, eye candy

**Functional effect**:
An effect whose job — feedback, legibility or accessibility — cannot be delivered without it,
such as a loading shimmer, a focus ring or a dialog's enter/exit.
_Avoid_: Necessary animation, real effect
