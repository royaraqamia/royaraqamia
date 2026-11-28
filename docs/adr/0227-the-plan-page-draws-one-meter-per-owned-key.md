# The plan page draws one meter per owned key

`#1951` measured the plan page against production and found that its one bar described nothing. The
thirteen owned-item caps summed to 65 slots on Free and 650 on Pro, while the fullest plain member in
the product held two rows in any one key: the page told that member they were using 3% of their plan,
and a new member 0%. The number argued against the tier it was meant to sell.

## Decision

1. **The caps stay as a server-side ceiling.** `plan_limits` and `assertOwnedItemCap` are unchanged: the
   row limit is what stops an unbounded account, not the page's instrument.
2. **The page draws one meter per key the member holds.** The sum of every cap is deleted from
   `frontend/ui/account/plan-view.tsx` and from the app's `UsageScreenModel`. A key with no rows draws
   no meter, a key with a cap of zero is an Admin placeholder and has no division, and a grandfathered
   overrun clamps at 100%. The daily counters keep their own block: a count that resets is not a slot.
3. **The axis is named in generated copy.** `capAxis` in `shared/copy/plan-card.json` heads the meters
   and is the sentence the server's `owned_item_cap` refusal answers with, generated into the same web,
   native and server modules. `npm run check:copy` keeps the three in step and `planRefusalResult`'s
   test asserts the refusal contains that string.

## Why not the alternatives

- **Lowering `free_cap` so the wall appears sooner** refuses the one account at two rows and still never
  says what the money buys.
- **Hiding the percentage and keeping the sum** stops saying "3%" while the tier stays a multiplier
  nobody reaches.
- **A new per-axis table in Postgres** is the long-term shape the audit sketches, but it changes the
  offer's data model, and this change is about what the page is allowed to claim about the model that
  already exists.

## Consequences

- The fullest real member now reads `2 / 5` in one key rather than 3% of 65 — a number they can act on.
- A member holding nothing sees no meter; the heading still names the plan they hold through the
  existing empty-history states.
- A cap change in `plan_limits` still reaches the page without a copy change: the meters read the
  body, and only the axis sentence lives in the copy source.
- The app is the pair: `PlanCard.kt` draws the same rows from the same `limits` body, and
  `docs/mobile/parity.json` still lists the component under `account-plan`.
