# A scan history keeps a summary, not the payload

ADR-0034 refused a scan history outright: "no API route, no table, no payload logging, no persisted
history", because a scan log is "a record of what people pointed their camera at". That refusal was
right about the thing it refused — a server-side copy of every payload. It was not an argument
against knowing that a member scanned the café's Wi-Fi code last Tuesday, and #1430 needs exactly
that: the assistant is asked "what was that code I scanned" and has nothing to read.

So the Scanner gains a history, and the payload still never leaves the device. A row holds the kind
of code, its format, one identifying label, and when it was last read. It has no column for the
payload, and the route's schema has no field for one either.

## The decision

1. **The summary is computed on the device, and the write has three fields.** `scanHistoryRecord` in
   `shared/contracts/scan-history.ts` builds it; `ScanHistoryRecordSchema` is a strict object of
   `kind`, `format` and `label`, so a client that tried to send `value` is refused rather than
   filtered. "We do not store the code" is then a property of the request on the wire, not a promise
   about the server; the same rule is in `ScanHistorySummary` for the app.

2. **The label is the part that identifies, never the part that authenticates.** A link keeps its
   host and not its path or query (a signed URL and a tracking parameter both live there); an email
   keeps its domain; a phone number keeps its last three digits; a Wi-Fi code keeps the SSID; a vCard
   keeps the name; an OTP keeps the issuer; a location and a plain text keep nothing. A test per kind
   feeds a real secret and asserts the row does not contain it, and `shared/fixtures/scan-history-labels.json`
   is read by both clients' suites so the two implementations cannot drift.

3. **One code is one row.** A unique index over `(user_id, kind, label)` with `nulls not distinct`
   makes a second scan of the same code `seen_count + 1` and a new `last_seen_at`, not a second row.
   A history is for finding a code again; a log of every read is a different product nobody asked
   for.

4. **Ninety days, and two hundred rows per member.** `sweep_scan_history` runs daily on pg_cron, the
   same shape the news digests use: past 90 days from the last read, then past the two hundredth row.
   The value of "that code from last month" decays quickly, and the cap makes the table small enough
   that the read is never a budget question.

5. **The member is the row's whole audience, and the writer is one function.** RLS is owner-only for
   `select` and `delete`, and `authenticated` holds no `insert` or `update` grant at all:
   `record_scan_history` is a `security definer` function that re-reads `auth.uid()` and does the
   insert-or-count in one statement, which PostgREST's `onConflict` cannot express. There is no admin
   policy, and deleting the account cascades.

6. **The section is drawn in both clients, from one copy source.** `ScanHistory` on the page and
   `ScanHistory.kt` in the app read `shared/copy/scan-history.json`, and the pair is listed in
   `docs/mobile/parity.json`. It sits below the measured scanner card, so the visual contract's
   recorded region is unchanged; a pixel baseline for the block is the next slice that can measure it,
   and the parity row is what keeps it from silently existing on one side only.

7. **The assistant reads the summary, and only the summary.** `get_scan_history` answers kind, label,
   day and count. It cannot answer "what was the password": that would put a credential into a turn,
   and a turn is sent to a model provider. This is the reason the strict schema matters more than the
   encryption question — no tier, policy or cipher fixes a read path that hands the value to a model.

## Why not the alternatives

- **Store the payload and let the tool redact it.** The redaction then runs inside the same process
  that answers the model, one bug from shipping a Wi-Fi password to a third party, and the table is a
  credential store for the sake of a field no legitimate reader ever sees.
- **Encrypt the payload in Postgres with an app key.** Backups, point-in-time recovery copies and a
  support query all keep working on the ciphertext's key, so the blast radius barely changes; the key
  management, rotation and retention of a 90-day credential vault is a years-long liability for a
  feature whose value decays in weeks.
- **A hash and no text.** It cannot say "the café's Wi-Fi"; a history that answers only a count is a
  feature with no reader.
- **Keep it device-local only.** Then the assistant can never answer, which is #1430's whole reason
  for the table, and the list does not survive a new phone.
- **A local vault for re-reading a Wi-Fi password.** Honest, and deliberately not in this change: it
  is a second storage design per client (IndexedDB, Room) with its own delete promise, and the
  summary is what the issue asked for. It is the right follow-up if members ask for the password
  back, and it keeps that payload off the server when it lands.

## Consequences

- **What a member loses.** The history tells them which code it was, not what it said. A Wi-Fi
  password they scanned once and did not save is gone from the site — which is also true of the
  phone's own saved networks, and the honest trade for a table that cannot leak one.
- **What ADR-0034 still holds.** The Scanner still decodes on the device, still calls no server to
  read a code, still opens nothing automatically, and still logs no payload. The sentence it can no
  longer say is "nothing is stored"; it says, in the section's own words, that a summary is.
- **The write is fire-and-forget.** A failed history write is invisible, because a scan that worked
  must not become an error sentence; the retry is the member scanning again, which counts the same
  row again.
- **A guest keeps no history.** The plan limiter still counts guest scans locally; the section asks
  for sign-in rather than drawing an empty list, so nobody discovers the history at the moment they
  wanted it.
- **The tool's answer is bounded.** Twenty rows by default, fifty at most, and the row carries a
  Damascus day the server formatted so the two clients do not disagree about 23:50.
