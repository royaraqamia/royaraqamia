# A queued link password is sealed on the device

Date: 2026-11-07
Status: Accepted

## Context

A signed-in LinkSnap create or edit can carry a password. Both are offline-first:
the row and its replay intent commit into the identity's own SQLite file
(`linksnap__guest.db`, `linksnap__user:<id>.db`) before anything is sent, and the
intent is replayed later (#654, ADR-0109). That file is a plain database, so a
password written into the payload is a credential at rest.

The web's Outbox has the same shape and stores the password in the clear in
IndexedDB. The app deliberately does not copy that: an APK is a distributed
binary, and a device file can be read by anyone who can read the device.

## Decision

**The queued password is ciphertext, and the key is never on disk with it.**
`LinkPasswordCipher` (`android/.../store/linksnap/LinkPasswordCipher.kt`) is the
seam; the app's adapter is an AES-256-GCM AndroidKeyStore key with its own alias,
`rr-linksnap-link-password`, generated on first use and non-exportable. It reuses
the platform mechanics of the session's `KeystoreTokenCipher` under a different
key, so rotating one cannot open the other's blobs.

**The intent payload carries the sealed value.** The `password` field keeps its
contract shape but holds `sealed:v1:` followed by `iv:ciphertext`; the marker is
what tells a sealed payload from one written by a build before this decision. It
is opened in `LinksnapWriteTransport.requestFor` only as the request is built,
and only if the device still holds the key.

**Two failure modes are honest, and neither falls back to plaintext.**

- If the Keystore refuses to seal (a locked device, a provider error), the write
  is not queued at all. `createLink`/`updateLink` throw
  `LinkPasswordUnavailable` with a sentence the screen draws
  (`LinksnapRepository.PASSWORD_CANNOT_BE_SEALED`), and neither the row nor the
  intent is written.
- If the key is gone after the write was queued (a device-lock change invalidated
  it, a restore to another phone), the drain cannot open the payload. The intent
  is failed permanently and surfaced as such; the sealed text is never sent as if
  it were the visitor's password.

This covers `link.create` and `link.update`. It does not change the guest's
online create (not queued) or unlock (a live read).

## Consequences

- This is a deliberate difference from the web. A queued password is portable
  only on the device that sealed it; a restore that loses the Keystore key loses
  the queued write, which is the correct failure for a credential.
- No schema change: the payload is still one JSON string, so the database stays
  at version 1 and no migration is owed.
- A queued plaintext password written by a build before this decision stays
  readable and is sent as it always was; the marker exists so a sealed payload is
  never mistaken for one of those.
- The rule is pinned by `LinksnapWritesTest`: the outbox row does not contain the
  password, a killed-and-reopened store drains it to the same body the web sends,
  a refusing seal writes nothing, and a lost key fails the drain without a
  request.
