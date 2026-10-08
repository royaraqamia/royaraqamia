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

**Media Provider**:
The external backend that turns a media link into a downloadable file. The site does not
extract or convert media itself.
_Avoid_: Extractor, downloader service, ripper

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
