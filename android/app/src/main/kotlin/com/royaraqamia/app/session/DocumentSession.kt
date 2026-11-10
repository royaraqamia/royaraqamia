package com.royaraqamia.app.session

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The session the document's cookie jar holds (#1194).
 *
 * The site signs in, and it stores what it signed in with in `@supabase/ssr`'s
 * cookie, not in the app's token store. Without a bridge those are two
 * universes: a member signed in on the phone reaches a native screen as a guest,
 * because the shell never learned who the page is ([ADR-0117](../../../../../docs/adr/0117-the-document-is-the-app-until-a-port-is-the-same-screen.md)'s
 * "the native session goes quiet" cost).
 *
 * This type is the one session, read from the jar both clients share:
 * [raw] is the session JSON exactly as GoTrue minted it, because that is what
 * has to be written back when the app rotates it, and the four fields beside it
 * are what the session needs to decide whose rows and which token.
 *
 * The cookie is a dependency's format, not ours (`@supabase/ssr` owns the
 * `base64-` prefix and the 3180-character chunks). `shared/fixtures/session-cookie/`
 * is what keeps this side honest: the web suite writes it through the real
 * package and the app's suite reads it with [DocumentSessionCookie].
 */
data class DocumentSession(
    val raw: String,
    val accessToken: String,
    val refreshToken: String,
    val userId: String,
    val expiresAt: Long,
)

/** One change the jar has to make: a cookie to write, or one to remove. */
sealed interface CookieChange {
    data class Set(val name: String, val value: String) : CookieChange

    data class Remove(val name: String) : CookieChange
}

/**
 * `@supabase/ssr`'s cookie, read and written (#1194).
 *
 * The format, in the order the package applies it: the storage key is
 * `sb-<project-ref>-auth-token`; the value is `base64-` + the session JSON in
 * base64url without padding; a value longer than 3180 characters is split into
 * `…auth-token.0`, `…auth-token.1`, … and joined back in order.
 *
 * Reading tolerates the two forms that are not chunked – a plain JSON value, and
 * a value that carries no `base64-` prefix – because a package upgrade can only
 * move this format, and a cookie this build cannot read has to be *no session*
 * rather than a crash on the launch path.
 */
object DocumentSessionCookie {
    /** The prefix `@supabase/ssr` puts in front of a base64url session. */
    const val BASE64_PREFIX = "base64-"

    /** The package's chunk size, in characters of the encoded value. */
    const val MAX_CHUNK = 3180

    /** How many chunks a reader will join before it decides the cookie is junk. */
    private const val MAX_CHUNKS = 5

    private const val ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

    private val json = Json { ignoreUnknownKeys = true }

    /**
     * The cookie's name for a project, from the auth base the app already has:
     * `https://<ref>.supabase.co/auth/v1` → `sb-<ref>-auth-token`, which is the
     * key `@supabase/ssr` derives from the same URL.
     */
    fun storageKey(authUrl: String): String {
        val host = authUrl.substringAfter("://").substringBefore('/')
        return "sb-${host.substringBefore('.')}-auth-token"
    }

    /** The cookie names in a header, in jar order, split at the first `=`. */
    fun names(header: String?): Set<String> = parse(header).keys

    /**
     * The session in a cookie header, or `null` when there is none or it is not
     * one this build can read.
     */
    fun read(header: String?, storageKey: String): DocumentSession? {
        val jar = parse(header)
        val value = jar[storageKey] ?: joinedChunks(jar, storageKey) ?: return null
        val decoded = decodeValue(value) ?: return null
        return parseSession(decoded)
    }

    /**
     * What the jar has to change for [session], given the names it already holds.
     *
     * The stale removals are the half a writer forgets: a session that shrank
     * from three chunks to one leaves `.1` and `.2` behind, and the next package
     * write joins them onto a shorter value. The package deletes them for the
     * same reason.
     */
    fun changes(
        session: DocumentSession,
        storageKey: String,
        existing: Set<String>,
    ): List<CookieChange> {
        val value = BASE64_PREFIX + base64UrlEncode(session.raw)
        val written = namesFor(value, storageKey)
        val values = valuesFor(value, storageKey)
        val sets = written.mapIndexed { index, name -> CookieChange.Set(name, values[index]) }
        return sets + removals(storageKey, existing - written.toSet())
    }

    /** A sign-out: every cookie this session's key owns is removed. */
    fun removals(storageKey: String, existing: Set<String>): List<CookieChange> =
        existing
            .filter { it == storageKey || chunkIndex(it, storageKey) != null }
            .sorted()
            .map(CookieChange::Remove)

    private fun parse(header: String?): Map<String, String> {
        if (header.isNullOrBlank()) return emptyMap()
        val jar = LinkedHashMap<String, String>()
        for (part in header.split(';')) {
            val entry = part.trim()
            if (entry.isEmpty()) continue
            val separator = entry.indexOf('=')
            if (separator <= 0) continue
            val name = entry.substring(0, separator).trim()
            if (name.isEmpty()) continue
            // A jar is a set: the first occurrence wins, the way a browser reads it.
            jar.putIfAbsent(name, entry.substring(separator + 1))
        }
        return jar
    }

    private fun joinedChunks(jar: Map<String, String>, storageKey: String): String? {
        val joined = StringBuilder()
        for (index in 0 until MAX_CHUNKS) {
            val chunk = jar["$storageKey.$index"] ?: break
            joined.append(chunk)
        }
        return joined.takeIf { it.isNotEmpty() }?.toString()
    }

    private fun decodeValue(value: String): String? =
        when {
            value.startsWith(BASE64_PREFIX) ->
                runCatching { base64UrlDecode(value.substring(BASE64_PREFIX.length)) }.getOrNull()
            value.trimStart().startsWith("{") -> value
            else -> null
        }

    private fun parseSession(raw: String): DocumentSession? =
        runCatching {
            val root = json.parseToJsonElement(raw).jsonObject
            val accessToken = root["access_token"]?.jsonPrimitive?.contentEmpty() ?: return null
            val refreshToken = root["refresh_token"]?.jsonPrimitive?.contentEmpty() ?: return null
            val userId = root["user"]?.jsonObject?.get("id")?.jsonPrimitive?.contentEmpty() ?: return null
            val expiresAt = root["expires_at"]?.jsonPrimitive?.content?.toLongOrNull() ?: 0
            DocumentSession(raw, accessToken, refreshToken, userId, expiresAt)
        }.getOrNull()

    private fun kotlinx.serialization.json.JsonPrimitive.contentEmpty(): String? =
        content.takeIf { it.isNotEmpty() }

    private fun namesFor(value: String, storageKey: String): List<String> =
        if (value.length <= MAX_CHUNK) {
            listOf(storageKey)
        } else {
            (0 until (value.length + MAX_CHUNK - 1) / MAX_CHUNK).map { "$storageKey.$it" }
        }

    private fun valuesFor(value: String, storageKey: String): List<String> =
        if (value.length <= MAX_CHUNK) {
            listOf(value)
        } else {
            value.chunked(MAX_CHUNK)
        }

    private fun chunkIndex(name: String, storageKey: String): Int? {
        if (!name.startsWith("$storageKey.")) return null
        val suffix = name.substring(storageKey.length + 1)
        if (suffix.isEmpty() || suffix.length > 3) return null
        if (suffix.any { it !in '0'..'9' }) return null
        if (suffix.length > 1 && suffix.startsWith("0")) return null
        return suffix.toIntOrNull()
    }

    /** base64url without padding, matching the package's own encoder. */
    fun base64UrlEncode(raw: String): String {
        val bytes = raw.toByteArray(Charsets.UTF_8)
        val out = StringBuilder((bytes.size * 4 + 2) / 3)
        var buffer = 0
        var bits = 0
        for (byte in bytes) {
            buffer = ((buffer shl 8) or (byte.toInt() and 0xFF)) and 0xFFFFF
            bits += 8
            while (bits >= 6) {
                out.append(ALPHABET[(buffer shr (bits - 6)) and 0x3F])
                bits -= 6
            }
        }
        if (bits > 0) {
            out.append(ALPHABET[(buffer shl (6 - bits)) and 0x3F])
        }
        return out.toString()
    }

    /** base64url back to text; throws when [encoded] is not base64url. */
    fun base64UrlDecode(encoded: String): String {
        val bytes = java.io.ByteArrayOutputStream(encoded.length * 3 / 4)
        var buffer = 0
        var bits = 0
        for (character in encoded) {
            if (character == '=' || character.isWhitespace()) continue
            val value = ALPHABET.indexOf(character)
            require(value >= 0) { "not base64url: $character" }
            buffer = ((buffer shl 6) or value) and 0xFFFFFF
            bits += 6
            if (bits >= 8) {
                bytes.write((buffer shr (bits - 8)) and 0xFF)
                bits -= 8
            }
        }
        return bytes.toByteArray().toString(Charsets.UTF_8)
    }
}
