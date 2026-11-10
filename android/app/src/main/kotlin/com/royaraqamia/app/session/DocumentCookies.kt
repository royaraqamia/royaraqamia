package com.royaraqamia.app.session

import android.webkit.CookieManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Where the document's session lives, as the app reads and writes it (#1194).
 *
 * One interface, two callers: the session reads it to learn who the page signed
 * in as, and writes it back after a native rotation so the page and the app are
 * never two different sessions. The rules are in [Session] and
 * [DocumentSessionCookie]; this seam is only the jar.
 */
interface DocumentCookies {
    /** The session in the jar now, or `null` when the page is signed out. */
    suspend fun read(): DocumentSession?

    /** Makes [session] the jar's one session, removing any stale chunks. */
    suspend fun write(session: DocumentSession)

    /** Signs the page out: the same cookies `signOut` on the site clears. */
    suspend fun clear()
}

/**
 * The WebView's own cookie jar (#1194).
 *
 * `@supabase/ssr` writes its session with `httpOnly: false` and `SameSite=Lax`,
 * because the browser client has to read it; that is also what lets the shell
 * read it with [CookieManager]. Nothing here logs a value, and the access token
 * is never written anywhere but this jar and the session's memory.
 *
 * The jar belongs to the process, not to one WebView, so this is the same cookie
 * the document sends to the site's server components. That is the point: the
 * page and the app share one session rather than two that drift.
 */
class AndroidDocumentCookies(
    private val origin: String,
    private val storageKey: String,
    private val jar: () -> CookieManager = { CookieManager.getInstance() },
) : DocumentCookies {
    override suspend fun read(): DocumentSession? =
        withContext(Dispatchers.Main.immediate) {
            DocumentSessionCookie.read(jar().getCookie(origin), storageKey)
        }

    override suspend fun write(session: DocumentSession) =
        withContext(Dispatchers.Main.immediate) {
            val manager = jar()
            val existing = DocumentSessionCookie.names(manager.getCookie(origin))
            for (change in DocumentSessionCookie.changes(session, storageKey, existing)) {
                when (change) {
                    is CookieChange.Set ->
                        manager.setCookie(origin, "${change.name}=${change.value}; $ATTRIBUTES")
                    is CookieChange.Remove ->
                        manager.setCookie(origin, "${change.name}=; Path=/; Max-Age=0; Secure")
                }
            }
            manager.flush()
        }

    override suspend fun clear() =
        withContext(Dispatchers.Main.immediate) {
            val manager = jar()
            val existing = DocumentSessionCookie.names(manager.getCookie(origin))
            for (change in DocumentSessionCookie.removals(storageKey, existing)) {
                if (change is CookieChange.Remove) {
                    manager.setCookie(origin, "${change.name}=; Path=/; Max-Age=0; Secure")
                }
            }
            manager.flush()
        }

    private companion object {
        /**
         * What the package writes: a root path, the same 400-day lifetime as
         * `@supabase/ssr`'s default cookie options, and `Secure` because the
         * document is served over https.
         */
        const val ATTRIBUTES = "Path=/; Max-Age=34560000; SameSite=Lax; Secure"
    }
}

/**
 * Whether a page is in front, which decides who may rotate the session (#1194).
 *
 * The document owns the same refresh-token chain the app does, and the server
 * rotates it single-use: if the shell refreshed while the page was on screen,
 * the page's in-memory token would be the one the server just spent, and the
 * member would be signed out of the site they are looking at. So the app renews
 * only while the document is *not* in front – which is also the only time it has
 * work of its own to do.
 */
object DocumentForeground {
    @Volatile
    private var foreground = false

    @JvmStatic
    fun set(visible: Boolean) {
        foreground = visible
    }

    @JvmStatic
    fun visible(): Boolean = foreground
}
