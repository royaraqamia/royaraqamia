# A voice note is the same in every thread

The assistant learned to hear a voice note (#1030, ADR-0126). The member's thread did not: it had a
paperclip and nothing else, so a member could attach a recording they had made in another app but
could not speak one into the chat they were already in. The two composers then drifted — the
assistant's had a microphone at the end of its row, the member's a paperclip at the start — and a
control copied twice is a control that drifts.

The APK made the gap visible: pressing the assistant's microphone answered
«تعذّر التسجيل. تحقّق من إذن الميكروفون.» on a device whose microphone was working. The cause was not
the browser. `android/app/src/main/AndroidManifest.xml` declared no `RECORD_AUDIO`, so Capacitor's
`BridgeWebChromeClient.onPermissionRequest` had nothing to grant the WebView's `AUDIO_CAPTURE`
request: the refusal happened before any Android dialog was drawn, and no device setting could have
granted it. The Scanner's camera had the same shape of bug, fixed the same way.

## Decision

1. **One composer, both threads.** `frontend/ui/chats/chat-composer.tsx` draws the row for the
   member's thread and the assistant's: the textarea, the paperclip, the microphone immediately
   beside it, and send. The order is WhatsApp's and Telegram's, because that is where a thumb already
   goes. A change to the control is a change to both threads by construction, not by discipline.
2. **Hold to record, release to send.** A press opens the bar: the timer, the live waveform from an
   `AnalyserNode`, slide-away or the X to throw it away, the lock to keep recording hands-free, then
   the stop button ends and sends. A hold shorter than a second is a tap, not a note
   (`CHAT_VOICE_NOTE_MIN_MS`), and five minutes is the ceiling (`CHAT_VOICE_NOTE_MAX_MS`) — the bar
   sends what it has at the cap rather than discarding the member's words.
3. **One file, 24 kHz mono WAV.** ADR-0126 chose 16 kHz because the clip existed to be transcribed.
   It now exists to be _heard_ as well, and the same object has to satisfy both: the browser records
   WebM/Opus or MP4/AAC, the gateway transcribes WAV natively, and 16 kHz is audibly thin in a
   player while 48 kHz would spend 29 MB on five minutes. The page decodes and re-renders at 24 kHz
   (`CHAT_VOICE_NOTE_SAMPLE_RATE`), about 48 KB a second and 14 MB at the cap.
4. **A member's voice note is audio, not a transcript.** A direct thread is not a question to a
   model: nothing is transcribed, no allowance is spent, and the bubble is the recording. The
   assistant's note is still transcribed first (ADR-0126) — one file, read once, on demand.
5. **The clip is played where it sits.** `voice-note-player.tsx` draws the clip's own shape — decoded
   once per attachment and cached, with flat bars until it is — and offers play/pause, seek and
   1x/1.5x/2x. A clip that will not decode falls back to the download it always was.
6. **The assistant reads any file it can.** The paperclip is no longer a member-thread privilege: up
   to five files per turn, and each reaches the model as what it is — a recording as its transcript,
   an image as an image part, a text file as text, and anything else (PDF, archives, documents) as one
   sentence saying it cannot be read rather than a guess at its contents. The allowance a refused turn
   reserved is given back.
7. **The shell declares the microphone.** `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` are declared
   with the camera's reasoning, and `android.hardware.microphone` is `required="false"` so a device
   without one still installs and still types.

## Consequences

- Five minutes of speech is about 14 MB, well inside the 25 MB per-file ceiling and the member's own
  storage allowance; a longer thought is a second note.
- A recording is uploaded before the assistant's turn starts, exactly as ADR-0126 had it, and a turn
  that fails puts the objects back rather than leaving them unnamed in the bucket.
- A text file is read up to 20 000 characters in the turn: enough for a long note, not a book.
- The player's shape costs one extra read of the clip, served from the browser's cache because the
  upload sets `cacheControl`. A thread that is only scrolled never pays it.
- Shells published before this change still refuse the microphone. The page cannot tell that apart
  from a browser-level refusal, so it says what it knows: check the permission.

## Alternatives considered

- **Keep two composers, copy the control.** Fewer files, and the exact drift this ADR exists to
  prevent: the next change lands on one row and not the other.
- **Send the browser's Opus/WebM as recorded.** Smaller and better sounding, but the gateway's WebM
  path is untested (ADR-0126 proved WAV and OGG), and Safari records MP4/AAC — three containers to
  keep working instead of one.
- **Transcribe member notes too.** Searchable threads, at one model call per note and an allowance
  nobody asked to spend on a conversation between two people.
- **A native Android recorder.** The chats surface is still the document in the app (#937); a native
  recorder now would be a port with no ported screen to live in.
