# 0229. The assistant is called what the member calls it

## Status

Accepted (2026-11-28). Applies [ADR-0228](./0228-the-assistants-face-and-voice-belong-to-the-member.md)
(name, face and voice on the row) and keeps ADR-0224 decision 2's boundary: the
row stays owner-only. Amends ADR-0224 decision 8 (the copy no longer has to be
gender-blind) and the site's use of «المساعد» as a label.

## Context

ADR-0224 made the name a member's own and wrote the name into the panel's
snapshot, but the rest of the site never followed. Every other sentence that
named the assistant was a constant: «نور» in the panel intro and placeholder, in
the chats row and the agent prefix, in the memory title, in the MCP screens and
in the corner's invitation; «المساعد» in the account row, the page's aria labels,
the grants sentence and the coding page. A member who renamed their copy still
met نور and «المساعد» on the next screen.

The copy also disagreed with itself about gender. ADR-0224 decision 8 avoided
the problem by making the third person neutral, but the strings that remained
were mixed: «نور غير متاحة» and «تفكّر» are feminine, while «لن يستطيع نور» and
«يستطيع نور» are masculine. With the member now choosing the voice (ADR-0228),
a constant can only be wrong half the time.

## Decision

1. **One identity read per session, on the client.** `SessionProvider` reads the
   assistant identity once when the member is known and exposes `assistantName`
   (resolved to «نور»), `assistantVoice` and `assistantAvatarUrl`. Every label
   reads that one value; `/assistant` refreshes it after a write. The panel keeps
   its snapshot for the first paint (ADR-0150) and falls back to the session.

2. **The name is copy data, not a literal.** A string that must name the
   assistant carries `{name}` in `shared/copy/*.json`; the web fills it through
   `assistantNameIn`, and the app fills it through `AssistantName.inText` with
   the deployment default, because the app has no identity read yet. No client
   renders a brace, and the day the app reads the identity only `AssistantName`
   changes.

3. **No user-facing label says «المساعد».** The name is used, or the sentence is
   written without a name at all. The admin moderation list keeps its neutral
   sender label: it is a moderator's view of many members' threads, not a
   member's view of their own copy.

4. **Gendered third-person wording is removed, not duplicated.** «تفكّر» and
   «تكتب» become «جاري التفكير...» and «جاري الكتابة...»; «نور غير متاحة» becomes
   «المحادثة غير متاحة حالياً»; the MCP sentences make «الوصول» the subject
   («سيتوقف وصوله إلى أدوات هذا التطبيق», «ليستمر الوصول إلى أدواته»), which is
   grammatical at either voice; the intro and the sources line speak in the
   first person («أنا {name}», «قرأتُ هذه الصفحات»). Only the one-line status
   keeps a pair — «متاحة الآن» / «متاح الآن» — because there is no neutral way to
   say it about a person, and the prompt's identity block carries the voice to
   the model. A duplicated string per voice was rejected: it doubles every
   label's source and drifts in the half nobody reads.

5. **The prompt carries the name and the voice.** A turn appends a quoted
   identity block to the standing prompt: the name the member chose, the voice
   it speaks in, the statement that both override any fixed name or voice in the
   standing instructions, and that the name is data rather than an instruction.
   The first turn and a resumed turn both read the row, so a rename lands on the
   next message. The standing prompt stays byte-for-byte unchanged: it is the
   text the eval transcripts are hashed against, and a prompt edit cannot be
   silent (`check:agent-evals`).

6. **The coding surface is the same assistant, named normally.** «المساعد
   المبرمج» becomes «مهام البرمجة» — the capability's own name, which the
   assistant's home already uses for its row — and the two body sentences drop
   their subject. Nothing in coding names a second product.

## Why not the alternatives

- **Infer the name or the gender from the model's context.** Rejected: the name
  is set on a page the model never sees, and a wrong guess is silent.
- **A second copy key for every gendered sentence.** Rejected: the web would
  render one of two nearly identical strings and the app a third; neutral prose
  is one source that is right at both voices.
- **Keep «المساعد» where the name is unavailable (guests, shared surfaces).**
  Rejected for the signed-in surfaces: the name is available, and the member
  asked for it. The guest card is rewritten without the noun instead.
- **Server-render every label with the member's name.** Rejected: these documents
  are cacheable precisely because they carry no member data (#448), and the
  identity already reaches the browser for the editor.

## Consequences

- The shared copy files change (`assistant-panel`, `assistant-launcher`,
  `chats-list`, `account-rows`, `account-memory`, `mcp-connection`, `mcp-store`,
  `shell-services`, `chat-thread`), so the generated Kotlin objects change too
  and nine call sites substitute `{name}` with the default. The app's visible
  behaviour changes in one place — the account row now reads «نور» — and the
  release note says so.
- `frontend/ui/chats/assistant-copy.ts` loses the name from its three sentences;
  it is the web-only copy for a surface with no port (#819).
- The memory page's static tab title keeps the default name: `metadata` is
  server-rendered and the page is a cacheable document, so it cannot carry the
  member's choice without moving the whole route out of that contract. The
  member's name is on every visible label of the page.
- `SYSTEM_PROMPT` gains no name: the identity block follows it. Prompt tests keep
  asserting the standing rules, and one turn test asserts the block's content.
- No new route, no schema change, no widening of who may read the identity.
- The identity's plain values (`ASSISTANT_DEFAULT_NAME`, the voice set) live in
  `shared/contracts/assistant-identity-constants.ts`, and the contract re-exports
  them. The root `SessionProvider` needs only the default name; importing the
  contract itself would put zod in every route's first-load chunk. The split was
  measured by `perf:check` (+63 KB gzip on `/community/explore`) before it.
- The Android app still paints its own name until the identity read ships there;
  this decision is what makes that a one-file change.
