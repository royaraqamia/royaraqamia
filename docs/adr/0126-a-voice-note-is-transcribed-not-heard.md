# A voice note is transcribed, not heard

The assistant answers text. A member on a phone would rather speak, and the pipeline's model takes
images and text but not audio — so a voice note has to become words somewhere. The browser records
WebM/Opus, the gateway transcribes WAV and OGG, and there is no ffmpeg on the app's runtime.

## Decision

1. **The page records, resamples and encodes.** `MediaRecorder` captures, `decodeAudioData` reads the
   clip, an `OfflineAudioContext` re-renders it at 16 kHz mono, and a 44-byte-header encoder writes
   the WAV. `MediaRecorder`'s own container is never sent: the whole point is that what reaches the
   provider is the one format every audio model accepts.
   This is why the bridge's ffmpeg dependency is not repeated here
   (`scripts/telegram-bridge.mjs:532`): a serverless Node function has no binary to call, and the
   browser is the only place in this stack with an audio decoder to hand.
2. **The recording is an attachment, not a body.** It is uploaded through the chats pipeline that
   already exists (25 MB / 1 GB caps, the member's own session, the bucket's policy), so the thread
   shows a voice chip and the member can hear what they actually sent.
3. **The transcript is the message.** The turn reads the object's bytes back through the member's
   session, transcribes, and writes the words as the message body — so the thread is searchable and
   the next turn's history is text. The audio stays attached; nothing is retranscribed later.
4. **A failed transcription is a sentence, not a guess.** The turn releases its allowance and answers
   «لم أستطع تحويل الصوت إلى نص» — the bridge's rule, for the same reason: a fabricated transcript is
   a fabricated question.
5. **The model is told the words are a transcript.** Otherwise it answers "you sent me text, not
   audio", which is true and useless (`scripts/telegram-bridge.mjs:864-872`).

## Consequences

- One extra upload and one extra model call per voice note. `gemini-4-argon` was the second
  candidate and was removed for cost, so a refusal now reaches the member as "could not transcribe"
  rather than as a silent second, dearer attempt.
- The WAV is ~32 KB/s: a minute of speech is about 2 MB, well inside the attachment ceiling.
- A browser without `MediaRecorder` or `OfflineAudioContext` cannot record. The button is the only
  entry point, so such a device simply types.
- Images are the same shape of work and are deliberately not in this change: they need a different
  content part and their own size cap.

## Alternatives considered

- **Send WebM/Opus as recorded.** Fewer lines, and untested on the gateway; the bridge's own probe
  showed the container matters (`docs/agents/telegram.md`).
- **Transcode on the server.** Needs ffmpeg, which the app's runtime does not have.
- **Keep the transcript in the turn row only.** The thread would hold an audio clip nobody can read,
  and the next turn's history would lose the question.

## Amendment (2026-11-04): the clip is heard too, and it is 24 kHz

The note assumed the recording existed to be transcribed. It is also played — in the assistant's
thread and, now, in a member's — so the clip is re-rendered at 24 kHz mono rather than 16 kHz, and
the member's thread records one without a model at all. The rest of the decision stands: one WAV
file, uploaded as an attachment, transcribed on the turn that reads it (ADR-0127).

## Amendment (2026-11-21): the mirror is not built, because the gateway has no speech model

The reverse of this decision — the assistant answering with a voice note (#1038) — starts with a
measurement rather than code, and the measurement says no. The gateway takes text, images and audio
input; nothing on it turns text into audio.

Measured on 2026-11-21 against `https://opencode.ai/inference/go/openai/v1` with
`node scripts/agent-probe.mjs --only models,speech`, plus one call per alternative route:

- `POST /audio/speech` answers **404**, for `tts-1`, `gpt-4o-mini-tts`, `gemini-4-argon`,
  `mimo-v2.6-flash` and `deepseek-v4.1-flash`.
- `POST /audio/generations`, `/audio/tts`, `/tts`, `/speech` and `/audio/transcriptions` all answer
  **404**; `GET` on each is **404** too.
- `GET /models` answers **200** with 31 ids, every one a chat or vision model. No text-to-speech
  model is on the plan. (#1038 was written when this endpoint did not exist; it does now, and its
  list is the answer.)
- `POST /chat/completions` with `modalities: ["text","audio"]` — the OpenAI-compatible alternative —
  is not a speech route either. `qwen4-max` validates Qwen's own voices (`Cherry`, `Ethan`,
  `Serena`, `Chelsie` pass; `Nofish` is refused by name), then answers **text only**, with no
  `audio` field on the message and no `delta.audio` in a stream. `mimo-v2.6-flash` and `minimax-m3`
  answer 200 with text only. `gemini-4-argon`, `gpt-5.6-luna` and `gpt-6-luna` refuse the parameter
  (`modalities: cannot be represented by …`).

So the text answer stands and nothing is synthesised: a reply with no audio is the honest result,
not a half-built toggle. The shape #1038 describes — the opt-in toggle, the clip as an attachment
written by the member as uploader, the text-hash cache, and a failed synthesis as a sentence — is
unchanged and waits on a model, not on design.

Two ways to buy one, both the owner's decision and neither taken here:

- **A second vendor's speech API.** One more credential (a speech key nobody has provisioned) and a
  bill metered per character or per minute, outside the OpenCode Go allowance that pays for every
  other model in this product. It needs its own ADR before a secret is added.
- **A self-hosted model.** The app's runtime has no GPU, no model binary and no ffmpeg — the same
  reason decision 1 hands decoding to the browser — so this is a separate host with its own storage
  and cold-start cost, not a route on the running service.

When the plan gains an audio-output model, `node scripts/agent-probe.mjs --only speech` asks the
route again; when it answers, #1038 applies as written and this amendment is superseded.

## Amendment (2026-11-25): the blocker is deployment-owned speech, not member-owned speech

The 2026-11-21 amendment concluded that the mirror waits on a model, and offered two ways to buy
one: a second vendor's speech API, or a self-hosted model. Both would put the speech credential and
its bill on this deployment, which is why neither was taken. The owner's decision of 2026-11-23
narrows the blocker to exactly that: speech the deployment owns stays refused, and speech a member
owns is allowed because it costs us nothing. That is a re-framing of the blocker, not a new vendor.

The gateway is unchanged. Re-measured on 2026-11-25 with
`node scripts/agent-probe.mjs --only models,speech` against
`https://opencode.ai/inference/go/openai/v1`:

- `POST /audio/speech` answers **404** with an empty body.
- `GET /models` answers **200** with 37 ids — chat, vision and embedding models — and no
  text-to-speech model among them.

So the gateway lane is still closed. What the owner's decision adds is the third way the 2026-11-21
amendment did not consider, because it was not yet a decision: a **member-owned** speech connection,
riding the same seam as a member-paid image or video (ADR-0216). The member supplies the key or
account, `mcp_connection_credentials` holds it encrypted, every call spends the member's own credits
behind a card, and the deployment holds no key and pays no bill. No environment variable and no
line in `render.yaml` is added.

That seam is built; a TTS vendor on it is not. The catalogue carries TTS rows — `ae.easyvoice/tts`,
`io.elevenlabs/mcp` and others the mirror has swept — but none is verified: `verified_at` is null on
every one, and `connect-service` refuses an unverified row with «هذا التطبيق غير معتمد في المتجر».
No row is an `api_key` TTS connection. Selecting a vendor and vouching for it is a curator's
decision — the same decision that admitted Higgsfield (ADR-0216) — so an agent may not invent one by
writing an adapter to a vendor it chose. The mirror therefore stays unbuilt for a new reason: not
"no speech exists anywhere", but "no member-owned speech connection is verified yet".

When one is, #1038's shape applies unchanged:

- A per-message toggle beside send, off by default, with the text still the answer and the
  transcript still on screen.
- A `SpeechClient` seam, so the vendor is one adapter and the turn never names it.
- The clip as an attachment on the assistant's reply, written with the member as uploader — the clip
  exists because they asked for it — which means `insertAgentMessage` needs the attachments path it
  does not have today.
- A text-hash cache, so the same sentence is not synthesised twice.
- A failed synthesis as one Arabic sentence, with the text answer kept.

The 2026-11-21 amendment's test is therefore widened. The member's own connection is the route to
ask, and `node scripts/agent-probe.mjs --only models,speech` rules out only the gateway. Until a
member-owned connection is verified, the honest result is the text answer and nothing synthesised.
