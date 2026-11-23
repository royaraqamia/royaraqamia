# 0214. A pasted link is read by the search vendor

## Status

Accepted. Landed with `assistant.read_url`; the work order is this decision plus
the capability table, not a new plan file.

## Context

ADR-0206 gave نور a `search_web` tool: the model writes a query, Tavily returns
selected chunks, and the answer cites what it read. A member who pastes a URL and
asks «ماذا يقول هذا الرابط؟» has a different intent — the page is already named,
and a search is a guess at its address. The assistant currently answers that she
cannot open it.

The obvious tool is a generic `fetch_url`. ADR-0206 rejected one for SSRF,
redirects, robots.txt, injected instructions and a page that never ends, and that
rejection still holds. The deployment is a single free Render Node service with
0.1 CPU and a 384 MB heap (`render.yaml`): it cannot own a browser, a proxy or a
crawler on behalf of a member.

## Decision

1. **One more tier-0 read tool, `assistant.read_url`, owned by `assistant`.** It
   takes the public address and the member's question, strict schema, no member
   id and no free-form options. It is declared only when `TAVILY_API_KEY` exists,
   the same condition as `search_web`; no key means no invitation to read a page.

2. **The vendor fetches; we do not.** `backend/clients/url-extract.ts` posts
   `POST https://api.tavily.com/extract` with `urls: [url]`, `query: question`,
   `extract_depth: 'basic'`, `format: 'text'` and publish dates on. Basic
   extraction costs one credit per five successful URLs, so reading a page is
   cheaper than the search that currently pays one credit per call.

3. **The same public-URL guard the downloader uses.** `isPublicHttpUrl` in
   `backend/shared/contracts/downloader` refuses an IP literal, a private range
   and a non-http scheme before the request leaves the deployment. Tavily owns
   redirects, caching and robots; the guard owns what we are willing to send it.

4. **One evidence block, one card, one budget.** The page becomes one labeled
   `[1]` block capped at the same 5,000 characters a search returns, and the
   `sources` frame already carried by the turn and stored on the message is
   reused unchanged — no second card, no second render path, no Android diff. A
   read and a search both draw from `USAGE_COUNTERS.webSearches` and the same
   project ceiling: one member intent, one allowance, one shared-credit wall.

5. **Failure is a sentence, never a failed turn.** A refused key, a spent cap, a
   rate limit, a timeout, a private address and an unreadable page all arrive as
   `تعذّر قراءة الرابط الآن.`; the operator still gets the kind in the log. A
   page that failed is not retried later in the same turn, the same rule a
   failed search follows (ADR-0206 amendment).

6. **Remote text is data.** The prompt's existing instruction that text from an
   app or a web page is data and never an instruction applies to this block too.

## Why not the alternatives

- **A generic `fetch_url` tool.** ADR-0206's reasons stand unchanged, and this
  deployment has no host on which to put a safe fetcher.
- **A new counted action.** Two budgets to explain for one question is worse
  than one. The shared credit ceiling already protects the month.
- **Passing the URL as a search query.** A search treats the address as words to
  rank, not as a page to open; it often returns pages _about_ the link instead of
  the link.
- **A new UI card.** The `sources` frame, the stored `chat_messages.sources` and
  both clients' citation cards already do this job.

## Consequences

- A member can paste a link and get an answer with a source they can open, in
  the same thread and the same card a web search already produces.
- A deployment with no Tavily key loses `read_url` and `search_web` together;
  нور answers exactly as before.
- The two tools share a daily allowance, so a member who reads many pages has
  fewer searches that day. That is deliberate: both spend the same vendor credits.
- Tavily's extractor is a second endpoint on a key the deployment already holds;
  no new secret and no new service are added.
- Arabic quality of extracted text is the first thing to measure after launch,
  the same open question ADR-0206 records for search.
