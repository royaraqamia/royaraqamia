# 0228. The assistant's face and voice belong to the member

## Status

Accepted (2026-11-28). Amends [ADR-0224](./0224-the-assistant-has-a-home-and-a-name-the-member-owns.md)
decisions 7 and 8: v1 customization is no longer "no avatar upload, no voice",
and the copy is no longer forbidden from agreeing with the name's gender. Applies
ADR-0098 (copy is a shared source), ADR-0224's owner-only boundary, and the
account avatar pipeline from #946.

## Context

ADR-0224 gave the assistant a name and a private row, and deliberately stopped
short of two things:

- **A face.** The member could not change the mark at all. The row carried
  `avatar_variant` 1-12, but no surface ever drew it — the panel, the thread and
  the home all draw the same orb. The home also drew the identity as a card in
  the page body: a label, a field and a save button, while the member's own name
  and photo are edited from the profile card with a pen and a camera badge.
- **A voice.** Decision 8 made the copy gender-neutral by construction: the
  assistant speaks in the first person, where Arabic marks no gender, and every
  third-person sentence was rewritten («جاري الكتابة...»). A member who named
  their copy «حكيم» still read «غير متاحة الآن».

Both were written down as v1 scope, not as permanent boundaries. Members now
ask for the account page's editing design, and a name alone cannot tell Arabic
whether to say متاح or متاحة.

## Decision

1. **The header is the editor, exactly as the account card is.** The page keeps
   the profile header, draws a pen beside the name and a camera badge on the
   mark, and opens two dialogs — one for the name (and the voice), one for the
   face (change / remove / cancel). The identity card in the page body is
   deleted. The dialogs use the account card's own primitives: `Dialog`,
   `Input`, `DialogActions`, `HeroCtaButton`, `ConfirmDialog`, and the same
   words wherever the sentence is about an image rather than a profile.

2. **The face is an uploaded image, in the account's bucket and under the
   account's folder rule.** `avatar_url` joins `public.assistant_identities`.
   `POST /api/account/assistant/avatar` stores the object at
   `<uid>/<uuid>.<ext>` and points the row at it; `DELETE` clears the column and
   deletes the object. The upload validates through one helper shared with the
   member avatar (`AvatarValidationError`, `prepareAvatarFile`), so the accepted
   formats, the 5 MB ceiling and the pixel limit cannot drift between the two.
   No new bucket, no new storage policy, no new object for anyone else to read.

3. **The orb is the fallback, not a variant.** A member with no upload still
   sees the orb, now inside the avatar circle with the camera badge so it is
   editable. `avatar_variant` stays in the table unused: the roster's future mark
   is not worth a destructive migration today.

4. **Gender is stored, never inferred.** `voice` is `'feminine' | 'masculine'`,
   default `feminine` (the wording the deployment ships for «نور»). It is chosen
   with a two-pill control inside the name dialog, after the name and before the
   actions; the dialog remains one screen on a 360px phone. Arabic names do not
   encode gender in their endings — نور, ريم and حكيم are not separable by
   spelling, and a guess that flips silently is worse than one explicit tap.

5. **The stored voice governs both the prompt and the site's labels.** The
   prompt's identity block and the copy that describes the assistant read the
   same value. First-person lines stay ungendered («جاري الكتابة...»); a
   third-person line that must agree with the name gets a variant rather than a
   neutral rewrite, because «غير متاح الآن» addressed to a feminine copy is the
   bug this decision exists to fix.

6. **The face is not a public face.** The identity row remains owner-only and no
   shared surface draws the name, the face or the voice — ADR-0224 decision 2
   still holds. The object is served from the public `avatars` bucket exactly as
   every avatar is; the URL is a UUID under the member's folder and is linked
   from nothing another member reads. If a later change puts the face on a
   shared surface, image moderation and an impersonation policy land with it:
   those were ADR-0224's reasons for refusing the upload, and they are not
   answered by the private row alone.

## Why not the alternatives

- **Infer the gender from the name.** Rejected: no reliable rule, and a wrong
  guess changes every verb about the assistant without the member asking.
- **Keep the identity as a body card and add a face upload to it.** Rejected:
  the account page already proved the pattern members ask for, and two editors
  for one row would drift in words and states.
- **Store the face as a variant of the orb.** Rejected: the member asked for
  their own image, and the orb has no way to carry one.
- **Put the voice picker on its own settings row.** Rejected for now: it is a
  property of the name, the name already has a dialog, and one extra field beats
  a second door on a page that is an index, not a settings site.
- **Rewrite every third-person line to be gender-neutral.** Rejected: Arabic
  neutral phrasing for an adult subject drifts into passive or plural, and the
  member who named the copy «حكيم» still reads a sentence about someone else.

## Consequences

- One additive migration: `avatar_url`, `voice`, two checks, no backfill. A
  member with no row reads `DEFAULT_ASSISTANT_IDENTITY`, which is null face and
  feminine voice — the exact screen they see today.
- One new route and two controller handlers; the service gains the account
  avatar's three-step write (validate, upload, point the row, then delete what
  it replaced) rather than a second implementation of it.
- `AvatarValidationError` and the file check move to
  `backend/services/users/avatar-file.ts`, imported by both services. The
  account behaviour is unchanged.
- The page loses a section and gains two dialogs; `assistant-home-copy.ts`
  gains the words and loses the card's. The page stays a document surface, so
  there is no Kotlin pair and no parity row.
- The name and face appear on the page only until the next change: the panel's
  header, the chats row and every label that says «المساعد» still need the
  member's identity, and the app's sheet has no identity read at all.
  [ADR-0229](./0229-the-assistant-is-called-what-the-member-calls-it.md) is that
  change for the site.
- The prompt reads the name and the voice in the same slice that turns the name
  into quoted data; the eval case for an instruction-shaped name still applies.
- No new public URL, no sitemap change, no member-visible surface outside
  `/assistant`.
