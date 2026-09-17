# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.
If `gh` cannot be installed on the current network, see
[When `gh` is unavailable](#when-gh-is-unavailable).

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## When `gh` is unavailable

Some networks block GitHub's release-asset CDN — `release-assets.githubusercontent.com`
and `objects.githubusercontent.com`, the `185.199.x.x` range — while leaving
`api.github.com` reachable. That makes `gh` uninstallable, because the MSI, the portable
zip, winget and choco all download from the blocked range. Check before assuming:

```powershell
Test-NetConnection release-assets.githubusercontent.com -Port 443
```

If `api.github.com` answers and that host does not, drive the REST API directly. The
credential git already uses for this repo (Windows Credential Manager, via
`git credential fill`) works: it authenticates as the repo owner with `repo` scope. Keep
it in-process — never print it, never write it to a file.

```powershell
$env:GIT_TERMINAL_PROMPT = '0'; $env:GCM_INTERACTIVE = 'Never'
$token = ("protocol=https`nhost=github.com`n`n" | git credential fill 2>$null |
  Select-String '^password=(.*)$').Matches.Groups[1].Value
$headers = @{ Authorization = "Bearer $token"; 'User-Agent' = 'opencode-cli'
              Accept = 'application/vnd.github+json' }
$repo = 'https://api.github.com/repos/royaraqamia/royaraqamia'
```

`ConvertTo-Json` cannot be used for the payload (see the traps below), so encode the two
fields explicitly:

```powershell
function Encode-JsonString([string]$s) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append([char]34)
  foreach ($ch in $s.ToCharArray()) {
    $code = [int]$ch
    if ($code -eq 34) { [void]$sb.Append('\"') }
    elseif ($code -eq 92) { [void]$sb.Append('\\') }
    elseif ($code -eq 13) { [void]$sb.Append('\r') }
    elseif ($code -eq 10) { [void]$sb.Append('\n') }
    elseif ($code -eq 9) { [void]$sb.Append('\t') }
    elseif ($code -lt 32 -or $code -gt 126) { [void]$sb.Append('\u' + $code.ToString('x4')) }
    else { [void]$sb.Append($ch) }
  }
  [void]$sb.Append([char]34)
  return $sb.ToString()
}
```

Then read, create and edit. Check the existing titles before creating, so a retry cannot
duplicate an issue:

```powershell
Invoke-RestMethod -Uri "$repo/issues?state=all&per_page=100" -Headers $headers   # read

$body = [System.IO.File]::ReadAllText($bodyPath, [System.Text.Encoding]::UTF8)
$json = '{"title":' + (Encode-JsonString $title) + ',"body":' + (Encode-JsonString $body) + '}'
Invoke-RestMethod -Uri "$repo/issues" -Headers $headers -Method Post `
  -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) `
  -ContentType 'application/json; charset=utf-8'

# edit an existing body in place
Invoke-RestMethod -Uri "$repo/issues/<n>" -Headers $headers -Method Patch `
  -Body ([System.Text.Encoding]::UTF8.GetBytes('{"body":' + (Encode-JsonString $body) + '}')) `
  -ContentType 'application/json; charset=utf-8'
```

### PowerShell 5.1 traps

Both cost real debugging time, and neither is obvious from the error you get.

- **`ConvertTo-Json` corrupts a string body** into `{"value": "..."}`. GitHub rejects it
  with `422` and an empty response, and the payload balloons from ~2 KB to ~3.8 MB. Use the
  encoder above instead.
- **`Get-Content -Raw` reads a BOM-less file as ANSI**, so UTF-8 punctuation becomes
  mojibake that is then *stored* on GitHub that way (`—` arrives as `â€"`). Always read with
  `[System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)`.
- **Responses are decoded as ANSI too**, so a correct body *looks* corrupted when printed.
  Verify what actually landed by counting bytes in the raw response — an em-dash is
  `E2 80 94`, mojibake is `C3 A2`:

  ```powershell
  $wc = New-Object System.Net.WebClient
  $wc.Headers.Add('Authorization', "Bearer $token")
  $wc.Headers.Add('User-Agent', 'opencode-cli')
  $bytes = $wc.DownloadData("$repo/issues/<n>")
  ```

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
