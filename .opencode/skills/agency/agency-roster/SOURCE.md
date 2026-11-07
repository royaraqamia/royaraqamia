# Source

- Upstream: https://github.com/msitarzewski/agency-agents
- Commit: `b859c515d813efcfc4755d3471dd9e7686c7706d`
- License: MIT (see `../LICENSE`)
- Shape: one skill per upstream agent file, `../../agency/<slug>/SKILL.md`; frontmatter rewritten to
  OpenCode's skill format (`name`, `description`, `metadata.opencode/autoinvoke: false`), the
  upstream `color`/`emoji`/`vibe`/`tools` fields dropped, the Markdown body kept verbatim.
- The strategy division's playbooks carry no `description` frontmatter, so they are copied verbatim
  into `playbooks/` as reference documents instead of becoming skills (`runbooks.json` included).
- `agency-roster` is the only advertised skill; every specialist is hidden and loads on demand.

## Regenerating

```powershell
git clone --depth 1 https://github.com/msitarzewski/agency-agents $env:TEMP\agency-agents
node scripts/import-agency-agents.mjs "$env:TEMP\agency-agents"
```

The importer reads the clone (never writes it), rebuilds the whole tree, and records the clone's
`HEAD`; pass `--commit <sha>` to pin a different revision. Keep the directory name equal to the
upstream file name without `.md` — that is the skill ID.
