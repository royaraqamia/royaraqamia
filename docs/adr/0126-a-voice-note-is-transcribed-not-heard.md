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

- One extra upload and one extra model call per voice note. The transcription list is cheapest-first
  (`mimo-v2.6-flash`, then `gemini-4-argon`), and a refusal steps over instead of ending the turn.
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
