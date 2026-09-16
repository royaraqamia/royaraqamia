# Training applications are anonymous and unpaid, unlike consultation bookings

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
- Protection is Cloudflare Turnstile plus a per-IP rate limit instead of authentication, and
  the rate limit **fails open** — a lead form must keep accepting leads when the limiter's
  store is unreachable.
- Accepting money later means adding it on top of an existing Application, not replacing this
  flow. The Course is referenced by slug rather than by a foreign key so that promoting
  Courses to their own table stays additive.
