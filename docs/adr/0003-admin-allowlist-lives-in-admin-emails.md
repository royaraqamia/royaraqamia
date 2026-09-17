# The admin allowlist lives in ADMIN_EMAILS; the database mirror is derived

"Is this person an Admin?" had two answers. The app guard trusts `ADMIN_EMAILS` alone
(`backend/middleware/admin-auth-guard.ts`), while `public.is_admin()` returned
`users.is_admin OR <jwt email> in app_settings.admin_emails`, so a revoked Admin could
retain certificate-write RLS. We decided `ADMIN_EMAILS` is the single source of truth:
`users.is_admin` and `app_settings.admin_emails` are derived mirrors written only by the
sync path, and `public.is_admin()` reads the mirror only rather than re-deriving from a
JWT claim. This keeps **Admin** a property of a deploy-time allowlist, as `CONTEXT.md`
defines it, instead of a role that can be granted from inside the app.

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
