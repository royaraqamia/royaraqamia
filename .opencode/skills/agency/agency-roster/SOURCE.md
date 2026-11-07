# Source

- Upstream: https://github.com/msitarzewski/agency-agents
- Commit: `b859c515d813efcfc4755d3471dd9e7686c7706d`
- License: MIT (see `../LICENSE`)
- Imported: 2026-11-07
- Shape: one skill per upstream agent file, `../../agency/<slug>/SKILL.md`; frontmatter rewritten to
  OpenCode's skill format (`name`, `description`, `metadata.opencode/autoinvoke: false`), the
  upstream `color`/`emoji`/`vibe`/`tools` fields dropped, the Markdown body kept verbatim.
- The strategy division's playbooks carry no `description` frontmatter, so they are copied verbatim
  into `playbooks/` as reference documents instead of becoming skills (`runbooks.json` included).
- `agency-roster` is the only advertised skill; every specialist is hidden and loads on demand.

## Regenerating

Clone upstream at the commit above, then rebuild the tree from its division directories
(`academic`, `design`, `engineering`, `finance`, `game-development`, `gis`, `healthcare`,
`marketing`, `paid-media`, `product`, `project-management`, `research`, `sales`, `security`,
`spatial-computing`, `specialized`, `strategy`, `support`, `testing`), skipping `README.md`.
A file with a `description` field becomes a skill; a file without one is copied to `playbooks/`.
Keep the directory name equal to the upstream file name without `.md` — that is the skill ID.
