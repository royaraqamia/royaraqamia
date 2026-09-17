# The admin allowlist lives in ADMIN_EMAILS; the database mirror is derived

"Is this person an Admin?" had two answers. The app guard trusts `ADMIN_EMAILS` alone
(`backend/middleware/admin-auth-guard.ts`), while `public.is_admin()` returned
`users.is_admin OR <jwt email> in app_settings.admin_emails`, so a revoked Admin could
retain certificate-write RLS. We decided `ADMIN_EMAILS` is the single source of truth:
`users.is_admin` and `app_settings.admin_emails` are derived mirrors written only by the
sync path. `public.is_admin()` must not treat the database's own copy as authoritative —
see the amendment below, which corrects how that check has to be written. This keeps
**Admin** a property of a deploy-time allowlist, as `CONTEXT.md` defines it, instead of a
role that can be granted from inside the app.

## Considered options

- **Make the `users` table the authority.** Rejected: it turns **Admin** into a grantable
  role, contradicting the glossary, and makes revocation a row edit rather than a deploy.
- **Leave `is_admin()` as the disjunction.** Rejected: the two answers can disagree, which
  is the bug this decision closes.

## Consequences

Revoking an address from `ADMIN_EMAILS` revokes **Admin** everywhere, but only once the
mirror sync has run — and that sync currently happens as a side effect of an Admin loading
a page. Making it deterministic is tracked separately in #92 rather than folded into this
decision. Changing `public.is_admin()` alters RLS semantics and requires its own migration.

## Amendment (2026-09-17): the mirror must not be an authorization input

The decision above stands. Its prescription was inverted, and has been corrected.

This ADR originally said `public.is_admin()` should "read the mirror only rather than
re-deriving from a JWT claim". That is unsafe. The mirror in question, `users.is_admin`,
sits in a table whose only UPDATE policy is `using (auth.uid() = id)` with no `WITH CHECK`,
so Postgres falls back to the USING expression as the check — it pins the row owner and no
column. The row owner could therefore write the flag, and the
`BEFORE INSERT OR UPDATE OF email` trigger never fired for an update that left `email`
alone; `email` was itself writable and not unique.

The correct shape is the opposite of what was written:

- **identity** comes from the verified JWT (`auth.jwt()->>'email'`), which a client cannot
  forge;
- **the allowlist** comes from `app_settings.admin_emails`, which is write-protected
  (`postgres` and `service_role` only, per its ACL);
- **`users.is_admin` authorizes nothing.** It may stay as a derived, display-and-query-only
  convenience — admin notification targeting reads it — or be dropped.

The client write path on `public.users` was closed immediately by
`20260917074312_lock_down_public_users_writes.sql`, which drops the table grants held by
`anon` and `authenticated` and re-grants only `select` plus
`update (name, avatar_url, bio)`. Removing the database's dependence on the flag itself is
the remaining work in #92.
