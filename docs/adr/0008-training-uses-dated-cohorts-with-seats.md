# Training uses dated cohorts with seats

A Course is now taught as one or more **Cohorts**: a dated intake with a fixed start date
and a fixed number of seats (~10). This gives the training offering its first genuinely
scarce resource, so an Application can reserve a seat — it no longer only records a lead.
It supersedes the "no scarce inventory" premise of
[ADR 0001](0001-training-applications-are-anonymous-and-unpaid.md) and the "single-page,
no new fields" shape of
[ADR 0007](0007-training-applications-stay-a-minimal-single-page-form.md).

The applicant names a Cohort when they apply, but **the seat is not claimed until an
operator enrolls them** (moves the Application to `enrolled` with a cohort). Applying
stays free, anonymous and unpaid; enrollment — an operator action — is what consumes
capacity. This keeps an anonymous, rate-limited, fail-open lead form from silently
holding inventory: ten abandoned applications must not be able to fill a ten-seat cohort.

## Considered Options

- **Apply consumes a seat immediately.** Rejected — a public, anonymous, unauthenticated
  form would then burn scarce capacity on every speculative submission, with no payment
  or commitment behind it.
- **Reuse the consultation slot machinery unchanged.** Rejected — its guard is a partial
  unique index that proves capacity **1** ("at most one active booking per slot"), which
  cannot express "at most N". Seats need a different primitive.
- **Count enrolled rows on read, then insert if below capacity.** Rejected — a
  time-of-check/time-of-use race; two operators count nine, both enroll, the cohort holds
  eleven.
- **Model a Cohort as N generated availability slots.** Rejected — it fakes capacity with
  ten pseudo-rows per cohort, leaks the implementation into the domain, and makes
  "cancel a student" a row deletion.

## Consequences

- Seat capacity is enforced by a stored `seats_taken` counter advanced through a guarded
  conditional update inside a Postgres RPC (the `enroll_application` function), so the
  enroll write and the capacity check share one transaction and return a deterministic
  `COHORT_FULL`. This is a **different primitive** from consultation's unique-index guard,
  deliberately: capacity N is not expressible by that index.
- Releasing a seat is an explicit operator path (`release_application`), unlike
  consultation, which has no cancel path in code. A dropped student must be able to free
  their seat.
- `status = 'enrolled'` now implies a non-null `cohort_id`; enrolling without a cohort is
  invalid and must be impossible from the admin UI, where a free-form status dropdown is
  replaced by an explicit enroll action with a required cohort.
- The stored counter is treated as derivable, not authoritative: it can be recomputed as
  the count of enrolled Applications in the cohort, and is reconciled on migration.
- Applications created before cohorts existed keep `cohort_id = null`; no backfill. Null
  means "applied when there were no cohorts", which is true.
- No money moves through enrollment (see [ADR 0006](0006-no-money-moves-through-the-system.md)).
  A seat is held on operator trust, not on payment.
