# A hidden service is an account preference the menu reads

`خدماتنا` ships sixteen rows. A member who books one consultation a year and
never opens the scanner scrolls past fourteen rows every time the menu opens, and
the home page's row repeats them. The product had no way to say «these are not
for me», so the menu was identical for everyone.

## The decision

- **The unit is a menu row, not a product.** The sixteen rows in
  `frontend/ui/navbar/services-link.ts` are what a member can hide — Community,
  Certificates and Consultations are separate areas with their own navigation and
  are not rows in this menu. A row that is not in the menu is not hideable.
- **Hiding removes the row from the two places the menu is advertised**: the
  navbar dropdown (and the hero's sheet) and the home row under «ماذا نُقدّم؟».
  The destination still answers, an old bookmark still works, and no data is
  deleted or excluded from a count. Hiding is presentation, not access control.
- **The preference lives on the account**, in `public.hidden_services` — one row
  per hidden route, RLS-guarded to the owner. It travels with the member between
  the browser and the phone, which is what they expect from a setting they made
  in one of them. A guest has no preference and sees the whole menu; there is no
  device-local fallback, because a second store is a second truth that disagrees
  the moment the member opens the other client.
- **The key is the route** (`/quran`), because it is already the row's identity in
  both clients — `SERVICES_LINK.subItems[].href` on the site, `ServicesEntry.route`
  in the shell. A retired route leaves a stored row that no client matches, which
  is harmless, instead of a key that has to be migrated. `SERVICE_ROUTES` in
  `shared/contracts/hidden-services.ts` is the catalog, and a test asserts it is
  exactly the menu's rows.
- **The write replaces the whole set.** The settings page is a list of switches
  and its truth is «these are off»; a delta would need the server to guess what a
  half-saved page meant. The service diffs the set against the account's rows, so
  a save that changes nothing issues no statement.
- **The page that sets it is `/account/services`, and hiding happens nowhere
  else.** A misplaced tap in a scrolling menu is a service the member cannot find
  again; a page with sixteen switches is a decision they can see and undo.
- **A failed read shows everything.** The menu's default is the full list, and a
  network blip must not look like a product that lost its services. Only the
  settings page — where the member is trying to change the setting — says the
  read failed.
- **Hiding every row hides the surfaces that lead to them**: no navbar trigger, no
  hero CTA, no home section. A menu that opens onto nothing is a dead control, and
  the settings page is where it is undone.

## Why not the alternatives

- **Device storage (`localStorage` / DataStore)**: no migration and no API, but
  the browser and the phone would each hold their own answer, and clearing site
  data would silently reset a setting the member paid attention to.
- **A cookie mirrored from the API for a first paint without the flicker**: a
  second copy that goes stale on exactly the case account storage exists for —
  hiding on the phone — plus every clear path at sign-out and account deletion.
  The surfaces are a closed dropdown and a row below the fold; the window it would
  fix is one almost nobody sees.
- **A boolean column per service, or a JSON document**: sixteen columns that the
  catalog has to keep in step, or a document whose shape no constraint can check.
  A row-per-hidden-service is the smallest thing RLS can guard.
- **A hard `enum` on `service_key` in Postgres**: the catalog lives in TypeScript,
  and a constraint would refuse the next write the moment a row is added rather
  than leaving an ignored key behind.
- **Blocking the route itself**: hiding «أخفيت المسح» reads as a preference, not
  as «delete my scanner». Refusing a bookmarked URL would turn a cosmetic choice
  into a broken link.

## Consequences

- `GET`/`PUT /api/me/hidden-services` are the surface; the app reads the `GET` and
  filters its sheet, and the settings page is the document the shell already opens
  for account routes, so no native settings screen is owed.
- The shell filters `ServicesEntry.visibleRows(hidden)` rather than gaining states,
  because the parity row pairs the sixteen-row catalog with the site's; what a
  member hid is a fact about the account, not a variant of the menu.
- A new menu row needs a line in `SERVICE_ROUTES`; the contract test fails until
  it has one, which is what keeps the settings page from listing a service the
  member cannot hide.
