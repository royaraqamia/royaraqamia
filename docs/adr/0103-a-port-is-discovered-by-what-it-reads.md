# A port is discovered by what it reads, not by its name

`check:screens` finds a screen by its file name: `*Screen.kt`. The plan card is not a screen, and the
parity list is a hand-written row, so nothing made a _new_ ported component appear in it. An agent
could add `SummaryCard.kt` with `16.dp` corners and retyped Arabic, and every check in the repository
would stay green — the documentary rule in `AGENTS.md` was the only thing between that and `main`.

## The decision

- **The signal is what the file reads.** A Kotlin file that references `Recipes.` or `LucideVectors` is
  drawing the site's components by definition, so it is a port. The generated outputs themselves
  (`theme/Recipes.kt`, `ui/vectors/LucideVectors.kt`) and the contract types are excluded: they _are_
  the description, not a component that draws it.
- **A port owes a row.** `check:parity` fails an unclaimed one, naming the file and both ways out: add
  a row (route, copy, states) or list it under `exempt` with a reason.
- **An exemption is written down.** `"exempt": [{ "path", "reason" }]` — the same shape `screens.json`
  uses for a surface the app does not draw. An exemption without a reason fails, one for a file that
  does not exist fails, and one for a file that also has a row fails.

## Why not a name or a folder

- **A file-name convention** repeats the hole it is meant to close: the next component is called
  `Summary.kt`, and the check cannot see it.
- **A dedicated package** tells an agent _where to put_ a port rather than detecting one, and it would
  move `PlanCard.kt` for no behavioural reason.
- **An annotation** is one line an agent can forget, and forgetting is the failure mode: a file that
  reads the recipe has already declared itself.

## Consequences

- **The port list can no longer fall behind the code.** A component starts drawing the site's design
  and immediately owes its pair; the failure message says what to add.
- **The escape hatch is auditable.** A debug-only or unreleased component can land, but its exemption
  is a line in the manifest that a reviewer sees, not a silent omission.
- **`check:parity` reads every Kotlin file in `android/app/src/main`** (31 files today). That is a
  directory walk and a regex, in the same job as the other checks.
