# 0211. An unset habit reminder opts out

## Status

Accepted (2026-11-21). Resolves the product decision recorded in #1678.

## Context

The Add/Edit Habit form labels the reminder time «(بتوقيت دمشق، اختياري)» and submits an empty
field as `null`. `HabitWriteSchema` accepts null, and the assistant's `set_habit_reminder` summary
renders an empty time as «إزالة التذكير». Two of those three paths mean "no reminder"; the database
alone read null as a daily 07:00 Damascus reminder through
`coalesce(p_reminder_time, time '07:00')` in `habit_reminder_is_due`.

Deletion in this product is a tombstone: `habits.deleted_at` is set, and every application read
excludes it. Neither `habit_reminders_due` nor `send_recovery_nudges` did. Each producer selected
directly from `public.habits`, so a third producer — the assistant's reminder action, #1445 —
would copy the same filters and the same drift.

## Decision

1. **`reminder_time is null` means the member did not ask for a reminder.** Such a habit is in
   neither the daily reminder selection nor the recovery selection. The form's existing «اختياري»
   copy becomes true; no client copy changes and neither client spells a new string.
2. **One audience definition.** `private.habits_remindable` is the only place that decides which
   habits may notify: daily, not tombstoned, not archived, owned by a user, and with an explicitly
   chosen time. Producers join it and add only their own timing guards.
3. **Both selections are callable.** `public.habit_recovery_nudges_due(p_now)` mirrors the existing
   `habit_reminders_due(p_now)` so both audiences can be asserted against a pinned clock without
   inserting notifications or calling the push webhook. `send_recovery_nudges()` becomes a thin
   writer over that selection.
4. **Deletion ends notifications.** A tombstoned habit reaches neither selection. The bell's read
   path already excludes the row, so a notification already in the bell remains history, not a
   live reminder.
5. **The recovery nudge's missed day stays UTC for now**, as the cron body computed it. The rule
   moves into one function rather than a local variable, so a later move to the Damascus clock is a
   single edit with its own decision.
6. **Future producers inherit the audience.** A new writer joins the view (or calls it from
   `SECURITY DEFINER` code) instead of re-deriving filters from `public.habits`. The contract's
   nullable `reminderTime` is documented with the same meaning.

## Why not the alternatives

- **An explicit 07:00 default with an off switch.** It needs a second sentinel for "off", a visible
  default on the web form, the same control on the Android form #1396 has not built yet, and a copy
  change on both clients. The data also shows no member ever set a time, so the default would be a
  new behaviour for every existing member.
- **Add `and deleted_at is null` to the two functions and stop.** That fixes the tombstones and
  leaves the silent 07:00 schedule in place; the next producer copies two filters again.
- **Delete the 11,125 historical notification rows.** That resets a count, not the predicate that
  produced it. The count returns with real use.

## Consequences

- Members who left the optional field empty stop getting a daily 07:00 reminder they never asked
  for. The bell keeps the rows already written.
- Deleting a habit ends its reminders and recovery nudges at the next cron run. An async push
  queued before the delete can still be delivered; making the push worker re-check notification IDs
  before sending is a separate piece of work and is not claimed here.
- A third producer can no longer disagree about the audience without editing the view. The pgTAP
  file asserts the three boundary cases (null time, tombstone, live habit with a time) for both
  selections.
- `reminder_time` changing from "null means 07:00" to "null means off" is a stored-data semantic
  change, not a backfill: no row is rewritten and no applied migration is edited.
