# Training applications stay a minimal single-page form

> **Superseded by [ADR 0008](0008-training-uses-dated-cohorts-with-seats.md)
> (2026-10-01):** Courses now run as dated Cohorts with seats, which gives an
> Application a real decision to sequence — choosing a Cohort. The apply form gains a
> Cohort step, so it is no longer a single-page form. The "no new fields beyond
> contact + goal" part of this decision is likewise revisited.

A `/training/apply` Application collects only `full_name`, `phone_whatsapp` and an optional
`goal`, on a single page. It deliberately does **not** become a stepped wizard like the
Consultation, Project Request and Retainer flows, and it deliberately gains no new fields.

The other three flows are wizards because each sequences genuinely separate decisions —
picking a package, choosing a project type, listing existing projects. A Training
Application has no decision to sequence and no branching: it is three fields and a submit
button. Wrapping it in a stepper would add two taps, a progress indicator and page height
while buying nothing, against a form whose only job is to start a WhatsApp conversation
(see [ADR 0001](0001-training-applications-are-anonymous-and-unpaid.md)).

## Considered Options

- **Convert to a wizard for consistency.** Rejected — consistency in shape was not worth
  friction in a conversion-first lead form; the three wizard flows share a
  genuinely different shape of question.
- **Add qualifying fields (email, experience level, availability, payment intent).**
  Rejected — the operator qualifies during the WhatsApp follow-up. A field earns a place
  only if it changes the operator's _first_ message or is required for eligibility,
  scheduling or legal/consent; in a single-course, seat-less, payment-less flow, none do.
  `email` and `experience_level` were already dropped as dead weight
  (`20260917051454_drop_training_application_email_experience_level.sql`).

## Consequences

- A reasonable reader will see three wizard flows and one flat form. This ADR is why: the
  flat form is a deliberate deviation, not an oversight — do not "fix" it by adding steps.
- Revisit only if the visible field count grows past roughly four or five, at which point
  the form has decisions worth sequencing.
