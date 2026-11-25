# 0220. Typed text is never uploaded without a tap

## Status

Proposed (2026-11-25). Governs the AI rewrite and reply in the keyboard created by
[ADR-0219](0219-the-keyboard-is-an-ime-in-the-same-apk.md).

## Context

Everything in the keyboard works on the device except AI rewrite and reply. The IME is attached to
every text field on the phone — passwords, one-time codes, private messages — so an automatic upload
of composing text, clipboard content or prediction context would be a much larger exposure than the
site's assistant, which only sees text a member deliberately sends to it.

The repo already treats consent and ceilings as enforced facts rather than prompt text: a capability
declares its blast radius, nothing above tier 1 runs without a card, and a failed call releases what
it spent ([ADR-0180](0180-a-write-carries-a-tier-and-trust-is-granted-per-tool.md),
[ADR-0182](0182-memory-is-identity-facts-and-cited-recall.md)). The keyboard needs the same
shape without inheriting the assistant's tools, memory or card flow.

## Decision

1. **No keystroke, composing text, clipboard item or prediction context leaves the device.** The IME
   sends no telemetry and no analytics of any kind. This holds even when AI rewrite is enabled.
2. **A network request happens only on an explicit tap** of the rewrite or reply button. It carries
   only the text in composition at that moment, goes to a dedicated bounded endpoint behind our own
   gateway, and never runs on a keystroke.
3. **The result is a suggestion, never an insertion.** It is shown in a strip above the keys and the
   member chooses whether to commit it. A failed, timed-out or refused call leaves the composing text
   untouched and shows one Arabic sentence in the strip.
4. **AI is off by default**, enabled once through a consent screen that says plainly what is sent and
   where, and revocable from account settings. A visible indicator in the keyboard shows while it is
   enabled.
5. **The IME holds no site session.** It receives a narrow, short-lived, scoped token through the
   local bridge from the app, stored in Keystore-backed storage, revoked on sign-out and on consent
   withdrawal. The Supabase session cookie and refresh token never reach the IME process.
6. **The request is bounded outside the model**: a hard input-length cap, a hard output-length cap and
   a timeout; no tool access, no memory recall, no agent loop. It spends the member's existing daily
   allowance through the same meter, and a call that fails or times out spends nothing.
7. **On-device generative rewrite is not part of v1.** We do not describe the feature as private
   because it is local; we describe it as opt-in and say exactly what a tap sends.

## Why not the alternatives

- **Cloud analysis on every keystroke.** Best-in-class prediction is not worth uploading passwords
  and codes, and the latency would make the keyboard unusable on the reference phone.
- **On-device only.** A small local model cannot deliver rewrite quality consistently across the
  device fleet, and promising parity with the big brands would be dishonest.
- **Reuse the assistant turn verbatim.** It brings tools, cards, memory and a streaming UI into a
  surface that must stay under 100 ms; a rewrite is one bounded call, not a conversation.
- **Let the IME reuse the app's session token.** It puts a long-lived credential in a process that
  is resident in every app, and makes sign-out a race instead of a guarantee.

## Consequences

- One new bounded endpoint, one consent row in account settings, one local bridge for the scoped
  token, and a network-capture test that fails if any packet is observed while only typing.
- The exact route and the meter's row are decided at phase 4 of the plan; this decision fixes only
  the boundary — explicit tap, bounded payload, revocable token, no automatic upload.
- A member who never enables AI has a keyboard that is fully offline and produces no network traffic
  at all.
