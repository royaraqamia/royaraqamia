# 0206. The assistant searches the web and cites what it read

> **Amended 2026-11-18.** A search now gets one retry of a transient failure, an
> eight-second ceiling instead of four, and a single failure sentence per turn.
> Vendor status codes never reach the model. See the amendment at the end.

## Status

Accepted (program). Phase 0 is the client, the tool and the turn wiring; phase 1 is the citation
payload and the two clients that draw it. The plan is [docs/specs/web-search.md](../specs/web-search.md).

## Context

نور answers from three sources today: the model's training, the account row, and 22 read tools over
our own data plus the apps a member connects. Nothing in the turn reaches the open web. The system
prompt says so in as many words — `إن سُئلتِ عن شيء خارج معرفتك، قولي ذلك بوضوح بدل التخمين`
(`backend/services/chat/chat-agent-service.ts`) — and that sentence is what this ADR replaces.

Admitting ignorance is honest but it is not the product the member compares us to. When someone
asks what a new regulation says, what a currency closed at, or whether a claim they read is true,
the assistant they expect answers with a source they can open. Every assistant that does this —
ChatGPT, Gemini, Claude, Perplexity — does it the same way: a search tool the model chooses, pages
read before the answer, and citations in the reply.

Three facts about this deployment decide the shape:

- **The turn's token ceiling does not rise.** `docs/assistant/roadmap.md` already states the rule:
  new context is paid for by shrinking the history window, never by raising `CHAT_AGENT_TOKEN_BUDGET`.
  Web evidence is new context, so it must be small and explicitly reserved.
- **One key per deployment, one key in the turn.** `backend/clients/ai-chat.ts` already models the
  provider as environment variables and no code. A search vendor is the same kind of dependency.
- **A stranger's text is untrusted.** The turn already says that about app-tool answers
  (ADR-0155). A web page is a stranger's text with a larger surface.

The provider landscape on 2026-11-17, checked rather than remembered:

| Provider             | Free terms                                                                           | Fit                                                                               |
| -------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Tavily               | 1,000 credits/month, no credit card, 1 credit per `basic` search                     | Returns per-source chunks, publish dates, language boost; built for LLM grounding |
| Brave Search API     | $5 of credits every month, auto-applied (= 1,000 requests), prepaid, no subscription | Better latency and its own index; `llm/context` returns extracted passages        |
| Google Custom Search | **Closed to new customers**; existing keys stop on 2027-01-01                        | Not available to us                                                               |
| Bing Web Search      | Retired                                                                              | Not available                                                                     |
| Exa, Serper          | One-off trial credits                                                                | Not a recurring free tier                                                         |
| SearXNG, Wikipedia   | Keyless, but an instance to run or an encyclopaedia's coverage                       | The zero-dependency fallback, not the product                                     |

## Decision

1. **One tier-0 read tool, `search_web`, declared only when a key exists.** It is owned by
   `assistant`, like `list_specialists` and `find_app_tools`, and it joins the same registry
   (ADR-0183). A deployment with no `TAVILY_API_KEY` declares no tool — the same rule
   `find_app_tools` already follows — so no member is ever offered a capability the deployment
   cannot honour.

2. **The model decides, and the prompt tells it when.** Our own data tools come first: a question
   about the member's certificates is not a web question. The tool is for a fact outside our
   products, a fact that changes with time, or a request for sources. The prompt also carries the
   replacement for the "admit ignorance" line: search first when the tool is there, then say what
   could not be found.

3. **The vendor is a client behind an interface, not a dependency of the tool.**
   `backend/clients/web-search.ts` exposes `search(query, options)` and owns the request, the
   timeout, the response schema and the error mapping. Tavily is the first implementation; Brave's
   `llm/context` is a second implementation of the same interface when the free credits stop being
   enough. The turn never names a vendor.

4. **Evidence is selected chunks, not fetched pages.** The request asks for five results, three
   chunks per source, publish dates on, and no copy of the raw page
   (`max_results: 5`, `chunks_per_source: 3`, `include_published_date: true`,
   `include_raw_content: false`, `include_answer: false`). The three highest-scoring sources become
   the evidence, capped at 5,000 characters (about 1,250 tokens) in total. `include_answer` is off
   because the answer is our model's job: a second model's prose would arrive without its sources
   and compete with the one the member is reading.

5. **The budget is reserved, not raised.** A turn that declares `search_web` builds its history
   against `CHAT_AGENT_TOKEN_BUDGET - WEB_SEARCH_TOKEN_RESERVE` (1,300). When the search runs, the
   evidence is the only thing that grew. This is the roadmap's rule expressed in one subtraction.

6. **Consent is the turn, not a second budget.** A search is part of the message the member already
   sent, so the turn's `record_usage` is the only thing a member pays. A search is also its own
   counted action — `web.search` in `usage_limits` and `usage_action_costs`, named through
   `USAGE_COUNTERS.webSearches` — because the deployment's free credits are shared and a member
   allowance cannot see that. The member cap is a guard (free 5/day, pro 15/day), and
   `app_settings.chat_agent_web_search_project_daily_turns` (default 25) is the wall that keeps the
   month's 1,000 credits from being spent in a week. That wall is enforced by a trigger on
   `usage_events` mirroring `private.enforce_chat_agent_project_cap()`, so two concurrent turns
   cannot both take the last search of the day.

7. **Citations are data the server keeps, not prose the model remembers.** The tool result carries
   `sources[]` — `url`, `title`, `domain`, `publishedDate` — and the turn emits a `sources` frame
   before the answer. The stored assistant message keeps the same array in a nullable
   `chat_messages.sources` column, so reopening a thread does not lose its evidence. The reply cites
   in the text (`[1]`, `[2]`) and the card lists the sources the reply cites; when a reply cites
   nothing, the card lists what was read. The list is capped at five and the answer is asked for no
   more than three citations, because the assistant's register is a short answer, not a report.

8. **A quoted page is data, never instruction.** The prompt line that already governs app tools is
   extended to web evidence, every source is labeled with its title, domain and date inside the
   turn, and the tool result is length-capped before it ever reaches the model. The member's private
   details never enter a query: the prompt forbids it, and the client scrubs an email, a phone
   number or a UUID out of the query before the request leaves the deployment.

9. **Failure is a sentence, never a failed turn.** No key, a refused key, a spent project cap, a
   rate limit or a timeout all arrive as a tool answer the model reads — `تعذّر البحث الآن` — and
   the turn continues with what it has. The tool is not retried more than once, and only for a
   `429` whose `Retry-After` is two seconds or less.

## Why not the alternatives

- **Always search.** Every "مرحبا" would pay a second of latency and a credit. It is the right
  architecture only for a product whose whole promise is search, which is Perplexity's case and not
  ours.
- **Search after the model says it does not know.** It doubles latency at the worst moment, and it
  never fires for the failure that matters: the model that answers confidently and wrongly. The
  tool exists to prevent that answer, so it has to be available before it is written.
- **Snippets only.** A snippet is the page's own advertisement of itself. It is enough for "who is
  the prime minister" and not enough for a number, a date or a condition — which is exactly the
  class of question that sends someone to an assistant with sources.
- **A generic `fetch_url` tool.** It turns the member's question into an outbound request to any
  host the model names: SSRF, redirects, robots.txt, injected text, and a page that never ends. The
  search vendor's extractor already does the fetching with a cache and a policy; we consume its
  answer.
- **Google Custom Search.** It is closed to new customers and stops on 2027-01-01. Building on it
  would be a migration with a deadline.
- **A separate member allowance for search.** The member asked one question. Two budgets to explain
  and two refusals to word for one intent is worse than one. The turn is the unit; the search cap
  exists for the deployment's shared credits, not to ration the member.
- **Raising `CHAT_AGENT_TOKEN_BUDGET`.** It moves the cost of every turn, not the cost of the turn
  that searched, and it contradicts the roadmap's stated rule.

## Consequences

- The assistant can answer a class of question it currently refuses, and says where it read the
  answer. A member can check a claim without leaving the thread.
- A free deployment now has a second shared ceiling to watch. When it is spent, search disappears
  before the assistant does — the tool answers "not now" and the turn still writes.
- The message row grows a column, the stream grows a frame, and both clients grow a card. The web
  card and the Android sheet are one pair (ADR-0098, ADR-0103); the copy is one file.
- Arabic search quality is the open measurement. Tavily exposes a `language` boost; whether it
  returns Arabic sources as well as it returns English ones is a test to run before launch, with
  the fallback being an English keyword variant in the same query.
- A search does not survive the month if the project cap is raised carelessly: 25 a day is 775 of
  the 1,000 monthly credits, and the remaining 225 are the headroom that absorbs a busy day.
- Caching is deliberately absent in phase 0. When the month's credits run low, a table keyed by a
  normalized query with a 24-hour expiry is the first lever; it is cheaper than a provider change
  and it makes a repeated question instant. That decision is deferred until a measurement asks for
  it, not taken speculatively now.

## Amendment (2026-11-18) — one failure, one sentence

A real turn showed the model answering that the web search "did not respond three times". The
vendor had recorded three requests; the four-second ceiling cut them off before their answers
arrived, and the turn passed the raw English error text (`search answered 403`, a timeout string)
into the tool message. The model had no single sentence to work with and spent three rounds
narrating the retries.

Three changes follow from that:

- The client's own ceiling is eight seconds, still well inside the turn's 55. A basic search with
  three chunks and a detected date is not reliably answered in four.
- The one retry is no longer limited to a short `429`. It also covers a `5xx`, a dropped connection
  and our own timeout — the failures a second attempt actually fixes. A refused key, a spent plan
  and a malformed answer are still final, and a turn that has already aborted is never retried.
- `search_web` turns any failure into `WEB_SEARCH_UNAVAILABLE` before the answer reaches the model;
  the operator still gets the kind and the error in the log. A search that failed is not called
  again later in the same turn, so a dead vendor costs one attempt rather than three.

The budget, the citation payload and the tool contract are unchanged. A refused credential is now
logged at error level so it reaches the operator's alerts as the turn's own refused credential
already does.

One deployment constraint was measured during the same check: Tavily answers a keyed request from a
US or European egress and returns a CloudFront 403 from a Syrian one. The call is made by the server,
so a member's own address never reaches the vendor — a Syrian member of a deployment on Vercel
`dub1` or Render `frankfurt` searches without a VPN. Running `npm run dev` from a blocked region is
the one case that needs the Node process itself routed through an allowed proxy.
