# Consultation bookings become anonymous and unpaid

A Consultation Booking used to require an account, lock a slot for 24 hours and be
confirmed by an operator only after a manual ShamCash/MoneyGram transfer was proven
over WhatsApp. We removed both the signup wall and the payment step. A booking is now
submitted by any visitor, takes no payment, and holds its Availability Slots until an
operator confirms or rejects it.

We made the change because the account and the payment step were both gating the
coldest audience on the site — the same audience the training Application form was
built to stop losing. Requiring an account to ask for a consultation costs the lead;
requiring a manual transfer before anyone had even accepted the request added a second
wall behind the first. Consultations do still hold scarce inventory, so unlike a
training Application a booking keeps its slot lock, a pending state and a human
confirm/reject decision.

## Considered Options

- **Keep the account requirement, drop payment only.** Rejected — the account was the
  first wall and the more expensive one to cross; removing only the second leaves the
  lead lost at the same place.
- **Drop the slot lock too, making bookings pure leads.** Rejected — a consultation
  has a real, scarce calendar; two people cannot hold the same window. The lock is the
  product, not ceremony.
- **Auto-confirm on submit.** Rejected — an anonymous request that instantly consumes
  inventory can be used to deny the calendar to everyone else. An operator confirms.

## Consequences

- A booking generally cannot be attributed to an account. `user_id` is captured
  opportunistically when a session happens to exist, and is normally NULL. Email is no
  longer injected from an account and is left NULL.
- Protection is a per-IP rate limit instead of authentication, and it **fails open** —
  the same posture as a training Application. There is no expiry sweep: a pending
  booking holds its slots until an operator acts.
- Reference codes (`CONS-2026-A7K2M9QX`) replace the raw UUID in the WhatsApp handoff,
  mirroring an Application's Reference Code.
- The booker cannot read, list or cancel their booking — there is no account to key
  that on. Only operators see bookings, through the admin dashboard.
- Reinstating payment later means adding it on top of an existing Booking, not
  restoring the removed columns.
