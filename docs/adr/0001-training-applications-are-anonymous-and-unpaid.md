# Training applications are anonymous and unpaid, unlike consultation bookings

> **Superseded in part by [ADR 0002](0002-consultation-bookings-become-anonymous-and-unpaid.md)
> (2026-09-16):** consultation bookings are now anonymous and unpaid too. They still
> differ by holding scarce inventory and by requiring an operator decision.

Training and Consultations are the same shape of request — someone wants time from the
business — but we deliberately built them as opposites. A `/training/apply` submission is
open to anonymous visitors, reserves no seat, never expires and takes no payment.
Consultations require an account, lock a slot and expire.

We chose this because a Course has no scarce inventory to protect and no payment step to
sequence. The site was already collecting these leads through a WhatsApp deep link, so the
form only had to stop losing them, not to transact. Reusing the consultation booking
machinery would have meant encoding slot locks and expiry for a course that has neither.

## Considered Options

- **Mirror Consultations: require auth and payment up front.** Rejected — it puts a signup
  wall in front of the coldest audience on the site, and there is no course payment flow to
  collect into.
- **Keep it a WhatsApp deep link (no form, no record).** Rejected — a lead that exists only
  in a chat thread cannot be searched, assigned or counted.
- **Enquiry by email.** Rejected — it needs a new transactional template and still produces
  a lead nobody can track.

## Consequences

- An Application generally cannot be attributed to an account. `user_id` is captured
  opportunistically when a session happens to exist, and is normally absent.
- Protection is a rate limit instead of authentication: a loose per-IP cap
  (a backstop, sized so a shared classroom/NAT network of 100+ applicants is not
  throttled) plus a global cap that bounds total submissions, and the limit **fails
  open** — a lead form must keep accepting leads when the limiter's store is
  unreachable. Cloudflare Turnstile was dropped from this form: the friction sat
  in front of the coldest audience on the site for a flow that collects no money,
  leaving the rate limit as the only defence against automated abuse.
- Accepting money later means adding it on top of an existing Application, not replacing this
  flow. The Course is referenced by slug rather than by a foreign key so that promoting
  Courses to their own table stays additive.
