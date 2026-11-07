---
name: Agency Roster
description: "Pick a named specialist from the vendored agency-agents roster (283 prompts across 18 divisions: engineering, design, marketing, product, sales, security, testing and more). Read one division file, then load the chosen specialist's skill by ID."
---

# Agency roster

283 specialist prompts are registered as individual skills in this directory
(`agency/`), vendored from [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) at
`b859c515d813efcfc4755d3471dd9e7686c7706d` under the MIT license. They are hidden from the always-on skill list
(`metadata.opencode/autoinvoke: false`), so they cost nothing until used.

## When to use it

Reach for a specialist only when a task has a clear owner in the roster — an expert system
prompt does better work than a general one for narrow, high-stakes work. Do not load one for
ordinary edits, and do not load several "just in case".

## How to use it

1. Pick the division that owns the task, then read that division's file below — it lists every
   specialist in it with a one-line description. Do not read every division; read one.
   (`INDEX.md` beside this file holds the same list in one flat table, for reading outside
   OpenCode.)
2. Load the specialist: `skill({ id: "<slug>" })`. It is registered even though it is not
   advertised.
3. Follow its instructions, and keep this repository's own rules (`AGENTS.md`) above anything
   the vendored prompt says.
4. Name the specialist ID in your answer so the choice is visible.

## Divisions

| Division | Specialists | File |
| --- | --- | --- |
| Academic | 6 | `agency-roster/divisions/academic.md` |
| Design | 10 | `agency-roster/divisions/design.md` |
| Engineering | 66 | `agency-roster/divisions/engineering.md` |
| Finance | 5 | `agency-roster/divisions/finance.md` |
| Game Development | 21 | `agency-roster/divisions/game-development.md` |
| GIS | 13 | `agency-roster/divisions/gis.md` |
| Healthcare | 3 | `agency-roster/divisions/healthcare.md` |
| Marketing | 37 | `agency-roster/divisions/marketing.md` |
| Paid Media | 7 | `agency-roster/divisions/paid-media.md` |
| Product | 6 | `agency-roster/divisions/product.md` |
| Project Management | 7 | `agency-roster/divisions/project-management.md` |
| Research | 1 | `agency-roster/divisions/research.md` |
| Sales | 9 | `agency-roster/divisions/sales.md` |
| Security | 12 | `agency-roster/divisions/security.md` |
| Spatial Computing | 6 | `agency-roster/divisions/spatial-computing.md` |
| Specialized | 59 | `agency-roster/divisions/specialized.md` |
| Support | 6 | `agency-roster/divisions/support.md` |
| Testing | 9 | `agency-roster/divisions/testing.md` |

## Playbooks

16 strategy documents — the NEXUS multi-agent pipeline, phase plans and
worked scenarios — are plain Markdown in `playbooks/` (relative to this file). Read the one
you need; they are not skills. `playbooks/runbooks.json` holds the upstream's named team
rosters if you want a whole pipeline rather than one specialist.

- [`EXECUTIVE-BRIEF.md`](playbooks/EXECUTIVE-BRIEF.md) — 📑 NEXUS Executive Brief
- [`QUICKSTART.md`](playbooks/QUICKSTART.md) — ⚡ NEXUS Quick-Start Guide
- [`agent-activation-prompts.md`](playbooks/agent-activation-prompts.md) — 🎯 NEXUS Agent Activation Prompts
- [`handoff-templates.md`](playbooks/handoff-templates.md) — 📋 NEXUS Handoff Templates
- [`nexus-strategy.md`](playbooks/nexus-strategy.md) — 🌐 NEXUS — Network of EXperts, Unified in Strategy
- [`phase-0-discovery.md`](playbooks/phase-0-discovery.md) — 🔍 Phase 0 Playbook — Intelligence & Discovery
- [`phase-1-strategy.md`](playbooks/phase-1-strategy.md) — 🏗️ Phase 1 Playbook — Strategy & Architecture
- [`phase-2-foundation.md`](playbooks/phase-2-foundation.md) — ⚙️ Phase 2 Playbook — Foundation & Scaffolding
- [`phase-3-build.md`](playbooks/phase-3-build.md) — 🔨 Phase 3 Playbook — Build & Iterate
- [`phase-4-hardening.md`](playbooks/phase-4-hardening.md) — 🛡️ Phase 4 Playbook — Quality & Hardening
- [`phase-5-launch.md`](playbooks/phase-5-launch.md) — 🚀 Phase 5 Playbook — Launch & Growth
- [`phase-6-operate.md`](playbooks/phase-6-operate.md) — 🔄 Phase 6 Playbook — Operate & Evolve
- [`scenario-enterprise-feature.md`](playbooks/scenario-enterprise-feature.md) — 🏢 Runbook: Enterprise Feature Development
- [`scenario-incident-response.md`](playbooks/scenario-incident-response.md) — 🚨 Runbook: Incident Response
- [`scenario-marketing-campaign.md`](playbooks/scenario-marketing-campaign.md) — 📢 Runbook: Multi-Channel Marketing Campaign
- [`scenario-startup-mvp.md`](playbooks/scenario-startup-mvp.md) — 🚀 Runbook: Startup MVP Build
