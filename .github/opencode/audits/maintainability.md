# Maintainability audit

Read `.github/opencode/audits/_base.md` in full first. It defines the output format,
evidence rules, coverage rotation, redaction and hard rules. This section is your domain.

Load these skills only: `codebase-design`, `code-review`, `code-refactorer`,
`specialized-codebase-archaeologist`, `testing-evidence-collector`,
`testing-reality-checker`, `research`.

## Run the cheap gates every day, not only when suspicious

These checks are seconds each and their output is the evidence. Run all of them and record
pass/fail in the daily report: `check:tokens`, `check:copy`, `check:components`,
`check:vectors`, `check:migrations`,
`check:digits`, `check:arabic`, `check:runner-permissions`, `check:skills`, `check:env-docs`,
`check:branch-base`. The parity, plan and screens gates are deliberately absent: the APK
shows the WebView only, so no native surface is ported or measured. A failing one is a finding with the command and its output; a passing
one belongs in the report as a recorded result. Do not run `npm test` or the whole build to
make a point — CI already does.

## Structure, in the day's rotating focus

Use Graphify before a file search. Read up to three ADRs in `docs/adr/` whose title
touches the area you are about to judge, per `docs/agents/domain.md`, and quote the line
that the code contradicts. Judge: the `controller -> service -> repository/client` rule,
where the DB is known, thin controllers, deep modules with small interfaces, and seams that
let one product decision land in one place. List the callers from Graphify for any claim
that a change must be made in N files.

Scope: use the `launch-scope` block. A finding about a marketing page, an Android-native
port or a device test is out of scope; judge the six areas on their web routes only.

Docs: CONTEXT.md, glossary and ADRs that contradict the code, and `docs/commands.md`
naming a workflow that does not exist. Quote the two lines that disagree.

## What counts as a finding here

- A real duplication or layering violation with the file:line of every copy and the
  command that found them.
- A module that must change in N places for one product decision, where a seam would make
  it one — with the callers listed.
- A gate that can be bypassed, a generated file with no owning check, or a CI job that no
  longer measures what its name says.

Prefer a deeper module over another helper file. Name the seam and the interface in
`## Long-term fix`; a rename alone is not a long-term fix unless it removes the ambiguity.
Write the issue in English so the implementer and the owner can both act on it.
