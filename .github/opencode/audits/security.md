# Security audit

Read `.github/opencode/audits/_base.md` in full first. It defines the output format,
evidence rules, coverage rotation, redaction and hard rules. This section is your domain.

Load these skills only: `security-architect`, `security-appsec-engineer`,
`security-compliance-auditor`, `supabase`, `supabase-postgres-best-practices`,
`testing-evidence-collector`, `testing-reality-checker`, `research`.

## Start with the repo's own security surfaces

Read `docs/security.md` and `security/audit-exceptions.json`. The baseline there is the
contract: Zod validation in `shared/contracts`, Turnstile on auth forms, rate limiting,
strict TypeScript, no DB/SDK on the UI boundary, and a list of secret variables that must
never appear in a bundle or a log.

Use these commands and quote their output:

- `npm run audit:deps -- --scope=production` and `npm run audit:deps -- --scope=all`.
  Read each exception in `security/audit-exceptions.json`: if its expiry has passed, that
  is a finding. Follow ADR-0207: judge by severity **and reachability**; never propose a
  forced downgrade or a lockfile trick to silence an advisory.
- Query open CodeQL alerts through the GitHub REST API
  (`GET /repos/{owner}/{repo}/code-scanning/alerts?state=open`) with the workflow token.
  An alert dismissed without a reason is a finding; quote the alert and the missing reason.
- Search the tree for credential patterns and for any `NEXT_PUBLIC_*` that carries a
  secret. Quote the file:line. A secret in git history needs a different report from a
  secret in the current tree — say which one you proved.

## RLS needs the right proof

The Supabase MCP holds the service-role key, which **bypasses RLS**. Reading a table with
it proves nothing about a policy. To show that a row is reachable when it should not be,
make a read-only `GET` to the public REST endpoint with the publishable/anon key and show
the response. To show a policy is missing, quote its absence from `list_policies` /
`list_tables` output and pair it with that request. Never write through either surface.

## Scope: the six launch areas, in the day's rotating focus

Check auth callbacks and redirect allowlists, proxy gates, Turnstile enforcement, upload
paths, server actions, API route validation, response headers and TLS on the live origin,
and what is actually exposed in the client bundle. The APK loads those same routes in a
WebView, so a web finding is the app finding too. Read Render logs through the API; do not
paste raw log lines containing member data into an issue. Use the `launch-scope` block to
pick a route inside the six areas; Android manifest and port findings are out of scope.

## Reporting rule unique to this audit

An exploitable finding is `confidential: true` with a real `severity` and `confidence:
"high"`. The workflow opens a private security advisory for it and a redacted public
hardening issue. Evidence in a public issue must describe the class of flaw and the fix,
never a working exploit, a member record, a credential or a non-public endpoint. Hardening
recommendations with no exploit detail stay public with `confidential: false`.

Prefer a trust-boundary fix — a policy, a validation contract, a least-privilege role —
over a string check at one call site. Name the boundary in `## Long-term fix`.
