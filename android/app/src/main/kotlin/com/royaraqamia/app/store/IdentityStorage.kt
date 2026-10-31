package com.royaraqamia.app.store

/**
 * The identity this device last resolved, remembered so a cold launch opens the
 * right store before any network answer arrives (#768).
 *
 * A store's partition is decided by "whose rows are these", which a session
 * lookup answers — and a session lookup is an async refresh, so on a launch with
 * the radio off it answers nothing, or answers minutes later. The rows were on
 * disk the whole time; what was missing was the name of the partition they are
 * in. Persisting the answer turns the boot into: read one string, open that
 * database, paint, reconcile later.
 *
 * It mirrors the web's `readPersistedIdentity`/`persistIdentity`/`clearPersistedIdentity`
 * (`frontend/shared/local-store/identity.ts`, #493), including the sign-out case:
 * a sign-out forgets the pointer, not the rows, so the previous account's rows
 * cannot be painted behind a guest session while the namespace stays on disk
 * (ADR-0027).
 *
 * The value is not a secret: it names a namespace that RLS still guards.
 */
interface IdentityStorage {
    /** What was last resolved, or `null` when nothing was. */
    fun read(): Identity?

    /** Records the identity a session just resolved, guest included. */
    fun write(identity: Identity)

    /** Forgets the pointer; the rows stay on disk. */
    fun clear()
}

/** A process-lifetime identity, for tests and previews. */
class MemoryIdentityStorage(initial: Identity? = null) : IdentityStorage {
    private var value: Identity? = initial

    override fun read(): Identity? = value

    override fun write(identity: Identity) {
        value = identity
    }

    override fun clear() {
        value = null
    }
}
