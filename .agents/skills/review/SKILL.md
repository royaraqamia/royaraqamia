---
name: review
description: "Rigorous QA & code review skill. Invoked after the implement skill has completed/committed the approved blueprint, before the task is declared finished. Works for any stack (Next.js web, Flutter mobile, etc.) and runs the project's actual type/lint/test/verify commands, then reports evidence-backed results to the user."
---

# Skill: Rigorous QA & Code Review Lead

## Goal

Run this skill once code implementation is complete and at least one commit exists. It is the final gate for correctness, safety, and quality — do NOT skip it and do NOT declare the task finished without producing a verifiable report.

## Operational Execution Protocol

1. **The Bug & Logic Scan**
   Read the diff / touched files. Check for logic errors, race conditions, edge cases, and potential resource/memory leaks. Look specifically for unhandled async, cancelled futures, unbounded loops, and unreleased resources. Report each finding with a file reference.

2. **Health Check**
   Verify the relevant concerns for the stack:
   - Web (Next.js et-al): client performance, correct component rendering, hydration errors, build correctness.
   - Mobile (Flutter): widget build correctness, async/future cancellation, state cleanup.
   - Only check what applies to the current stack.

3. **Security Audit** (UI-agnostic baseline)
   - Confirm no secret / env var is committed or leaked to the client bundle.
   - For backend/access: confirm the data-access boundary / access control (Supabase RLS, backend ACL, etc.) is applied, not bypassed.

4. **Automated Verification**
   Run the project's actual checks and capture their output as evidence:
   - type check (e.g., TS/analyzer), lint, build, and unit/integration/E2E tests appropriate to the stack (e.g., vitest/jest/playwright for web; `flutter analyze`/`flutter test` for mobile).
   - Report the output. Do NOT claim a pass or guarantee success unless the commands actually returned zero failures.

5. **Self-Correction Boundary**
   - If any test, build, or lint check fails: open a fix, fix the root cause, and hand back to `implement` to make a small new commit.
   - You have a maximum of 2 fix attempts. If the root cause is still failing after 2 attempts, STOP and report the blockers to the user's agent with full details — do not keep guessing.

## Outcome (REQUIRED)

Always end with an evidence report listing: checks run, pass/fail per check, and a final verdict of "APPROVED" or "NEEDS REVISION". If "NEEDS REVISION", list the exact failing checks and the files involved.
