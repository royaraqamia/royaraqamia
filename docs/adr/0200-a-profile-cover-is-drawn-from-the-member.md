# A profile's cover is drawn from the member, not uploaded by them

The public profile (#927) draws a person's identity in a card with a soft glow
behind it, and it is correct — a name, a handle, two numbers, two doors, then
their posts. What it is not is _inhabited_: the only thing on the page that
differs per member is an 80px avatar, and everything else is the same generic
card for everyone. A stranger arriving from a post has no way to see that a
person lives here rather than an account.

The obvious answer is a cover image, and it is the wrong first answer. An
uploaded cover needs a bucket, a size limit, a crop control, an image path in
both clients' captures, and a moderation path for the one image that will be
abusive. It also needs a fallback for everybody who never uploads, which is
most people — so the feature's most common state is still the empty card we
started with, now with a smaller empty card under it. A curated gallery of
eight designed covers is cheaper but shares those eight looks across the whole
directory, and the member chooses a _style_, not themselves.

The other candidate is putting the name over the artwork, and that one fails on
its own arithmetic: every generated palette would have to clear contrast
against 24px bold Aref Ruqaa with its long descenders, at 393px, in a language
whose line breaking is already unforgiving. A visual choice would become an
accessibility audit.

## The decision

1. **The cover is a function of the member's row.** Twelve curated palettes,
   four angles, three orb placements, picked by integer arithmetic over the
   member's `id`. No column, no bucket, no moderation queue, no image request,
   no first-paint flash and no layout shift: the cover is a gradient the
   document already knows how to draw. It is seeded from `id` and not from the
   handle, because renaming yourself must not repaint your profile.

2. **The palettes are tokens, not component CSS.** They live in
   `shared/tokens/tokens.json` and leave through `npm run tokens:generate`,
   which already emits CSS custom properties _and_ Compose `Color`s and
   already carries a unit-tested HSL→ARGB conversion (ADR-0089, #647). A second
   seam for the same job is how the site and the app start disagreeing about a
   hue without either of them being edited.

3. **One fixture list binds the two implementations.** The index is integer
   math over code points, and the same integer written twice drifts silently.
   The shared `id → index` fixtures are asserted by a Vitest test and a Kotlin
   unit test, so a change that moves one client fails in the other.

4. **The cover carries no text and no meaning.** It is a band at the card's
   top, ending where the avatar's waist is; the name, the handle, the counts
   and the doors sit below it on the card. Nothing about a palette is then a
   contrast decision, and no generated hue can break a heading.

5. **«يتابعك» comes from the viewer's read, because it is the viewer's fact.**
   Not from `GET /api/u/[username]`, which is cached for every visitor
   (ADR-0172) and cannot answer it. `viewerState` answers it with a reverse
   `isFollowing` inside the `Promise.all` it already runs — one indexed read,
   no added round trip — and `followsYou` rides the existing follow response as
   an optional field, so an app build from before this decision still decodes
   it. Hidden for `self`, hidden for `blocked`, hidden from a guest: the same
   three rules the follow control already follows.

6. **The geometry is measured before it is asserted.** Three anatomies of the
   same header — a band with the avatar sunk into it, an edge-to-edge cover
   under a frosted shelf, and a card whose whole surface is the wash — were
   drawn against the real tokens and the real faces in a throwaway prototype at
   393×852 @2.75, in both a fresh and a lived-in state, before any component
   was written. The winning anatomy is what the visual contract is recorded
   from, not the reverse (ADR-0117, ADR-0118).

## Consequences

- The cover costs nothing at runtime: no migration, no storage policy, no
  moderation path, no new image on the directory's most-visited read. Making it
  _nicer_ later is a `cover_preset` column reusing these same twelve palettes,
  not an upload — the cheap version does not become a dead end.
- Deterministic covers collide: two members can be given the same look. At this
  directory's size that is invisible, and it stays harmless at any size,
  because the avatar and the name are the identity and the cover is scenery.
- `profile-header` grows about 100px at 393 wide and `profile-cover` becomes a
  named box, so both captures and the raster diff are re-recorded in one change
  per client, and the app's `profile` surface — already `enabled: true` — moves
  in the same phase rather than drifting behind.
- The cover is `aria-hidden`, carries no text and no alt text, and nothing on
  the page means something only by its colour.
- A member who renames keeps their cover; a member who leaves and returns gets
  a new one, because the seed is the row's id and the row is new.
