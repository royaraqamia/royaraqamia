package com.royaraqamia.app.store

/**
 * Which partition a Local Store belongs to (#768), the app's half of the web's
 * `LocalIdentity` (`frontend/shared/local-store/identity.ts`).
 *
 * The web names the partition, not the tab: a guest's rows and each account's
 * rows live in separate databases, so they cannot bleed into one another, and
 * the name is the only thing that decides which one a read lands in. The app
 * has to spell it identically or the two clients describe different devices
 * ([ADR 0027]).
 *
 * The value is **not a credential**. It names a namespace a database may or may
 * not exist under; the bearer token and RLS are still the only things that
 * authorize a read (ADR-0027, offline-first spec).
 *
 * [ADR 0027]: ../../../../../../../../docs/adr/0027-the-web-app-is-offline-first.md
 */
sealed interface Identity {
    /** `guest`, or `user:<id>` — the string a store name is built from. */
    val key: String

    /** This device before anyone signed in. */
    data object Guest : Identity {
        override val key: String = GUEST_KEY
    }

    /** One account's namespace. The id is the server's, not a local invention. */
    data class User(val id: String) : Identity {
        override val key: String = "user:$id"
    }

    companion object {
        const val GUEST_KEY = "guest"

        /**
         * The identity a session resolves to, mirroring `identityFromUser`: a
         * non-empty id is an account, anything else is the guest namespace.
         */
        fun of(userId: String?): Identity =
            if (userId.isNullOrBlank()) Guest else User(userId)

        /**
         * The identity a stored name denotes, or `null` when it denotes nothing.
         *
         * A persisted value is read back after an upgrade that may have changed
         * its shape, so an unrecognised string is "nothing remembered" — the
         * guest namespace — rather than an exception on the launch path.
         */
        fun parse(key: String?): Identity? = when {
            key.isNullOrEmpty() -> null
            key == GUEST_KEY -> Guest
            key.startsWith("user:") -> key.removePrefix("user:").takeIf { it.isNotEmpty() }?.let(::User)
            else -> null
        }
    }
}

/**
 * `<product>__<identity>` — one durable database per product, per identity
 * (ADR-0027). It is the web's `localStoreName` with the file's extension added
 * by whoever opens a file, so a device dump reads the same on both clients.
 */
fun localStoreName(product: String, identity: Identity): String = "${product}__${identity.key}"
