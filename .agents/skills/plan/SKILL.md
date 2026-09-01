---
name: plan
description: 'Planning skill for a new feature or modification. Executes FIRST in the agentic workflow. Produces an architecture/blueprint and stops for explicit user approval BEFORE any code is written. Framework-agnostic (works for Next.js web, Flutter mobile, or any stack). Use when a new feature or modification is requested. Must be invoked before implementing on a non-trivial task.'
---

# Skill: Technical Planning & Blueprint Architecture

Execute this skill IMMEDIATELY when a new feature or modification is requested. Do NOT write code yet.

## Operational Execution Protocol

1. **Impact Analysis**: Analyze the request against the existing codebase. Identify which files will be modified, created, or deleted. Report the exact list to the user.

2. **Tech Stack & Conventions Check**: Identify the project type (e.g., Next.js web, Flutter mobile) and its stack from project config (`package.json`, `pubspec.yaml`, etc.). Enforce strict typing, the project's file naming conventions, and its existing architecture/patterns. If conventions are not documented, state this gap explicitly instead of guessing.

3. **Database / Persistence Preview**: If the feature requires data changes, draft the schema or update (e.g., Supabase for web, SQLite/Hive/Drift for Flutter). Explicitly plan access-control policies needed (e.g., Supabase RLS, app-level authorization). If no persistence layer exists, note that none is required.

4. **The Blueprint Blueprint**
   Present a structured plan that contains exactly the following sections:
   - **Files**: a file-tree blueprint of new/modified files (with paths).
   - **Logic flow**: for complex features (e.g., Auth, Payments, Webhooks) show the request/event flow and which layer owns each step.
   - **Gaps & edge cases**: list open questions, dependency risks, and edge cases to handle.
   - **Exit criteria**: explicit, checkable "done" conditions that the implement and review phases will verify against.

## Decision Gate (REQUIRED)

After presenting the blueprint, stop. Do not write any files or code.
End your response with exactly:

> Waiting for your explicit approval to proceed with the Implementation Phase.

- If the user requests changes, update the blueprint and re-present the exit criteria.
- If the user approves, release the gate and proceed to the `implement` skill.
