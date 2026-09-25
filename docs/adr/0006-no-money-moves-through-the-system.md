# No money moves through the system

The **Retainer** is sold at a fixed monthly fee and the site already advertises instalment
payment for builds, so a subscription or billing layer would be the obvious reading. We
decided instead that v1 records terms and nothing else: a **Retainer** stores
`monthly_fee_usd` and a `paid_through` date, a **Project Request** carries no money at all,
and every collection happens offline. This follows the precedent set by Consultation, whose
payment columns were deliberately dropped in `20260916153421_consultation_bookings_anonymous_and_unpaid.sql`,
and it avoids standing up invoices, webhooks, dunning and reconciliation to serve an intake
form. The fee field and the Retainer lifecycle leave room to attach billing later.

## Considered options

- **An online gateway with invoices and webhooks.** Rejected for v1: there is no payment
  infrastructure in the repo, and it is a project of its own, not a piece of an intake form.
- **A per-month paid/unpaid ledger.** Rejected as the billing model the project does not
  want yet; `paid_through` answers the one question an operator actually asks — is this
  client current?

## Consequences

"Who has paid" is a date an operator maintains by hand, and nothing reconciles the monthly
fee automatically; a client can be `active` while lapsed. A future reader should not read
the absence of billing as an oversight — it is the decision.
