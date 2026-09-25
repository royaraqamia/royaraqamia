# Client work is two independent intake flows, not a CRM

A **Retainer** is defined in terms of "a Client's own projects", so it was tempting to
introduce a shared spine — a **Client** owning **Project** rows, with a **Project Request**
creating one and a **Retainer** covering it — or to go further and build a small CRM. We
decided against both for now. **Project Request** and **Retainer** are two independent
intake flows modelled on Training and Consultation: anonymous, unpaid, reference-coded
leads, service-role-only, operated from the Admin Console. There are no Client or Project
tables; a Client exists only as contact fields on the lead that mentions it. The reason is
that a spine with no billing, no portal and no project detail would be structure with no
job — it would name relationships the system never acts on.

Room is left for the CRM-shaped future deliberately: the lead carries a nullable `user_id`,
its contact fields are the Client's identity, and `CONTEXT.md` fixes **Client** as a term
distinct from **User**. An accounts/portal layer can be added later without renaming
anything.

## Considered options

- **A minimal Client + Project spine.** Rejected: nothing reads it. The Retainer's monthly
  fee is never collected in-system, and no surface lists a Client's projects, so the
  relationships would be write-only.
- **A full CRM (clients, projects, milestones, logs).** Rejected as a different project,
  and unnecessary to ship either form.

## Consequences

Two leads for the same client stay two rows; there is no deduplication. If an accounts or
portal layer lands later, reconciling repeated leads into a single Client becomes migration
work rather than a table that already existed. Reversing this decision is therefore not a
rename — it is a data-modelling change.
