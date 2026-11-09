# Hidden services is retired

[ADR-0112](0112-a-hidden-service-is-an-account-preference.md) let a member hide
rows from `خدماتنا` because sixteen rows were too many to scroll. The homepage
is now the app door
([ADR-0146](0146-the-homepage-is-the-app-door.md)) and the menu is the picker
that adds apps to it. Hiding a row and adding it to the homepage are the same
decision, taken twice, so one of them has to go.

## The decision

- **The hidden set is removed, not inverted.** `public.hidden_services`, its API,
  its provider, `/account/services`, the native screen, the generated contract
  and the copy source are gone. There is no second preference to keep in step.
- **The rows are dropped.** The table held only presentation choices — routes a
  member once hid — and a preference with no reader is drift. The migration notes
  that the data cannot be restored; that is accepted for a cosmetic setting.
- **The picker is the only list.** Every app the catalog ships is visible in the
  sheet with Add or Remove. Nothing is filtered by a preference that no longer
  exists, so an app cannot become impossible to add.
- **The four lead forms leave the list.** `request-project`, `hire`,
  `training/apply` and `consultation/book` are services, not apps. Their routes
  stay live and indexed; the sheet stops being a navigation menu, so keeping them
  would leave four rows whose only action is to navigate somewhere — the exact
  behaviour the picker removed.

## Why not the alternatives

- **Keep both preferences.** Two switches per app («hidden from the menu», «on the
  homepage») are two answers to «do I want this here?». The member would have to
  reason about which one wins.
- **Keep the table dormant.** The API, provider and screens would still exist for
  a preference nothing reads. That is the drift the retirement removes.
- **Migrate hidden rows into the new table.** A hidden row meant «not in the
  menu»; the new table means «on my homepage». Copying them would add apps the
  member had explicitly removed — the opposite of their intent.

## Consequences

- The account page loses a row and a screen; the app loses a native screen and a
  repository. Nothing else reads the set.
- The settings that used to live in `/account/services` have no home, because
  the list itself is the setting: the sheet is where an app is added or removed.
- A member who hid an app now sees it in the sheet again and can choose whether
  to add it; no app becomes unreachable.
- The native sheet's add/remove behaviour is owed (ADR-0146); the removal of the
  hidden filter is already done, so both clients now start from the same 11 apps.
