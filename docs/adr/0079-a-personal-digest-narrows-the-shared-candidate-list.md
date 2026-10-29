# A reader's own digest is a rewrite of the shared candidate list, not a second fetch

A signed-in reader can opt into a digest of their own (`personal_enabled`). After the shared digest
publishes, the same workflow narrows the candidate list it already fetched to that reader's sources,
asks the model once for that reader, validates the answer, and writes `news_user_digests` /
`news_user_stories`. `/news` shows it by default, with a link to the shared digest for the same day.

This is the smallest thing that satisfies "let the reader choose their sources and have the agent
build from them" without weakening ADR-0076. The critical property is that **no new URL can enter**:
the candidate list is the one the deterministic fetch produced, the reader's selection only removes
candidates from it, and `validate-digest.mjs` still resolves every story id back to that list. A
second fetch per reader would have meant a second review-free source of truth, one model call per
reader per day from a public form, and a page that waits on a run instead of a table.

Four consequences are deliberate:

- **Opt-in, not automatic.** The preference stores which sources were kept; `personal_enabled`
  records that the reader asked for a digest at all. Picking sources alone does not spend credits,
  and a reader who forgets they opted in does not wake up to a bill.
- **Generation is free; reading is limited by cards.** `publish-personal-digest.mjs` writes the
  digest and charges nothing (ADR-0093), because a run whose model output failed validation publishes
  nothing and a digest nobody opens should cost the reader nothing. What the plan limits is how many
  story cards a page shows — 1 for a visitor, 5 on Free, 50 on Pro — so a personal digest with eight
  stories shows five to a Free reader.
- **A floor, not a target.** 3-12 stories, target 8. A reader who follows two quiet feeds gets
  nothing rather than a one-story "digest", because a nearly empty personal page reads as a broken
  site and the shared digest is strictly better.
- **No search, no archive mixing.** Search stays the retained month as published; the personal read
  is skipped while searching. A personal digest is one day, written once, replaced on a re-run.

The size window is the only rule the personal prompt changes (`buildPrompt` takes min/target/max).
Every other rule — the id-not-URL contract, Arabic copy, ASCII digits, the «جاري» spelling, region
and category priorities — is the same code, because it is the same prompt with a narrower list.

## Why not the app generate it on demand

A button that asks the model in the request path would need a provider client, a timeout budget and
a validator inside Next.js, plus a queue for the slow case. The nightly run already has all of that,
already holds the candidates, and already holds the service role. The trade is latency: a reader who
opts in today reads their digest tomorrow morning. That is the same promise the shared digest keeps,
and it is a sentence the picker can say.

## Considered options

- **One fetch per reader (their feeds, their digest).** Rejected: unreviewed sources enter the digest
  supply chain, model cost scales with sign-ups rather than with a daily job, and a bad feed takes
  out one reader's page with no candidate list to validate against.
- **Generate for everyone with a selection, without opt-in.** Rejected: spends a credit on behalf of
  readers who were only curating a checklist.
- **Charge at opt-in or at prompt preparation.** Rejected: a failed model run or a rejected digest
  would still bill the reader.
- **Store the personal digest in the shared tables with a nullable `user_id`.** Rejected: the shared
  tables are public and anonymous-readable; a nullable owner would put one RLS policy in front of
  both and make an anonymous read of a personal row a policy bug away.
- **Extend the shared digest to 30 stories and filter on read.** Rejected: thirty summaries cost the
  same model call as ten and the shared prompt gets worse for everyone, while a personal digest needs
  a _selection_, not a longer list.
