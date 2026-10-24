# A subscriber pays 20% less for the four quoted services

Four prices on the site are quoted rather than charged: the training fee, the consultation starting
price and every bookable package, the two project starting prices, and the monthly retainer. None of
them is paid online — each flow ends in an operator agreeing terms over WhatsApp. A paid plan now
carries a 20% discount on all four, and the price blocks show the subscriber figure with the list
price struck through.

## Where the percentage lives

`PRO_SERVICE_DISCOUNT_PERCENT` is a constant in `shared/service-pricing.ts`, next to the helpers that
apply it, not a column in `plan_settings`. ADR-0075's "every number comes from the catalog" rule is
about allowances the database enforces: a credit pool or a cap is checked in Postgres, so a page that
guessed it could promise something the write path refuses. A service discount is a marketing promise
on a flow that takes no payment; there is nothing to enforce, and the base prices it moves are already
code constants (`TRAINING_COURSE`, `CONSULTATION_START_PRICE_USD`, `PROJECT_REQUEST_*_START_PRICE_USD`,
`RETAINER_DEFAULT_MONTHLY_FEE_USD`). Keeping the percentage beside them means one deploy changes the
promise, and a test pins the five advertised figures (50→40, 25→20, 300→240, 600→480, 150→120).

Package prices are read from the database at runtime, so the discount is applied to whatever the
operator priced. It rounds to the nearest whole dollar: every other figure on the site is quoted that
way, and a $27.50 package should not start showing cents only to a subscriber.

## Who sees it

Only an active paid plan (`plan === 'pro'`) or an unlimited Admin. A guest and a free member see the
list price with no strikethrough — the benefit is a reason to subscribe, so it is not a crossed-out
tease on a page they cannot act on.

The viewer is resolved in two ways because the pages are built two ways:

- **Form pages** (`/training/apply`, `/request-project`, `/hire`) already resolve the session on the
  server, so `loadServiceDiscount` answers there and `ServiceDiscountProvider` receives
  `initialIsPro`. The first paint is correct and no extra allowance read is needed.
- **The home page** is shared by every visitor, so it must not read an account on the server.
  `ServiceDiscountProvider` resolves the same `/api/me/usage` answer the plan cards use, in the
  browser. Until it answers, the list price renders — the page never advertises a discount it could
  not confirm. `/consultation/book` is a precached shell (#450, ADR-0071) and takes the same client
  path.

A failed allowance read leaves the list price in place rather than guessing.

## What it deliberately does not change

- **Budget brackets.** The project-request brackets are stored keys with labels anchored on the list
  prices; a subscriber sees the discounted "starting from" figure, but the range they choose still
  reads at list price, so a submitted bracket means the same thing for every visitor.
- **Stored rows.** The retainer's `monthly_fee_usd` defaults to the advertised figure, and that is
  still what a submission records: it is the agreed-terms field an operator owns, not a charge the
  site collected. The operator applies the subscriber price when agreeing the quote.
- **Consultation bookings.** They no longer store an amount at all — `amount_due_usd` was dropped
  when bookings became anonymous and unpaid (`20260916153421`), so there is no stored figure that
  could disagree with the page.
- **Admin screens** keep showing list prices; an operator needs the catalogue, not the customer's
  view.

## Considered options

- **A `service_discount_percent` column in `plan_settings`.** Rejected: it would make a marketing
  number editable at runtime while the prices it multiplies stay in code, and no write path enforces
  it.
- **Render the home page per user on the server.** Rejected: it turns a cached marketing page into a
  dynamic one to avoid a sub-second price swap for signed-in subscribers.
- **Round to two decimals.** Rejected: it would introduce cents into a catalogue that never shows
  them.
- **Rewrite the retainer's stored fee per subscriber.** Rejected for now: the row is the operator's
  agreed terms, and the discount is settled in the same conversation the fee already is.
