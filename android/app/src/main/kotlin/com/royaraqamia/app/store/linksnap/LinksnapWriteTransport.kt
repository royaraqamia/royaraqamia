package com.royaraqamia.app.store.linksnap

import com.royaraqamia.app.contracts.generated.LinksnapCreateWrite
import com.royaraqamia.app.contracts.generated.LinksnapDeleteWrite
import com.royaraqamia.app.contracts.generated.LinksnapUnlockRequest
import com.royaraqamia.app.store.outbox.OutboxIntentRow
import com.royaraqamia.app.store.outbox.WriteRequest
import java.net.URLEncoder
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * A queued LinkSnap intent as the request the web's outbox sends (#654).
 *
 * The endpoints are the ones `frontend/api/linksnap/sync-transport.ts` already
 * drains to, so the server keeps one implementation and the two clients cannot
 * disagree about what a create is. `clientId` is the client-minted identity; the
 * server upserts on `(user_id, client_id)`, so a replayed write is idempotent and
 * a replayed delete re-sets the tombstone.
 */
object LinksnapWriteTransport {
    const val SHORTEN_PATH = "/linksnap/api/shorten"
    const val LINKS_PATH = "/linksnap/api/links"
    const val BULK_PATH = "/linksnap/api/links/bulk"
    const val UNLOCK_PATH = "/linksnap/api/unlock"

    /**
     * The request an intent becomes, with its sealed password opened just before
     * the body leaves the device (#921). A key the device no longer holds throws
     * here: the repository turns that into a permanent failure rather than
     * sending the ciphertext as the visitor's password.
     */
    fun requestFor(
        intent: OutboxIntentRow,
        passwords: LinkPasswordCipher,
    ): WriteRequest = when (intent.type) {
        "link.create" -> WriteRequest("POST", SHORTEN_PATH, openPassword(intent.payload, passwords))
        "link.update" -> WriteRequest("PATCH", LINKS_PATH, openPassword(intent.payload, passwords))
        "link.delete" -> deleteRequest(intent.payload)
        "link.bulk" -> bulkRequest(intent.payload)
        else -> throw IllegalArgumentException("Unknown outbox intent type: ${intent.type}")
    }

    /**
     * The payload with its `password` opened. A payload without one — or the
     * `null` that clears it — is returned untouched.
     */
    private fun openPassword(payload: String, passwords: LinkPasswordCipher): String {
        val body = LinksnapPayloads.withNulls.parseToJsonElement(payload).jsonObject
        val stored = body["password"]
        if (stored == null || stored is JsonNull) return payload
        val value = (stored as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return payload
        if (!LinkPasswords.isSealed(value)) return payload

        val opened = LinkPasswords.open(passwords, value)
        return JsonObject(
            body.mapValues { (key, element) ->
                if (key == "password") JsonPrimitive(opened) else element
            }
        ).toString()
    }

    /**
     * `DELETE /linksnap/api/links?code=…` with `{"updatedAt": …}` as the body.
     *
     * The slug rides in the path because that is the endpoint's lookup key, and
     * only the write time travels in the body because that is all the route
     * reads for its tombstone.
     */
    private fun deleteRequest(payload: String): WriteRequest {
        val body = LinksnapPayloads.withNulls.parseToJsonElement(payload).jsonObject
        val code =
            body["code"]?.jsonPrimitive?.content
                ?: throw IllegalArgumentException("a link.delete intent carries no code")
        val updatedAt =
            body["updatedAt"]?.jsonPrimitive?.content
                ?: throw IllegalArgumentException("a link.delete intent carries no updatedAt")
        val clientId = body["clientId"]?.jsonPrimitive?.content
        return WriteRequest(
            method = "DELETE",
            path = "$LINKS_PATH?code=${URLEncoder.encode(code, "UTF-8")}",
            body = LinksnapPayloads.delete(code, clientId, updatedAt),
        )
    }

    /**
     * `POST /linksnap/api/links/bulk` with `{action, codes, expiresAt}` (#942).
     *
     * This is the route the dashboard's bulk bar already writes to, so the app
     * and the page cannot disagree about what a bulk delete or expiry is. A
     * malformed payload is a permanent failure rather than a request the server
     * has to parse and refuse.
     */
    private fun bulkRequest(payload: String): WriteRequest {
        val body = LinksnapPayloads.withNulls.parseToJsonElement(payload).jsonObject
        val action =
            body["action"]?.jsonPrimitive?.content
                ?: throw IllegalArgumentException("a link.bulk intent carries no action")
        require(action == "delete" || action == "setExpiry") {
            "a link.bulk intent names action '$action'"
        }
        val codes = body["codes"]?.jsonArray ?: throw IllegalArgumentException("a link.bulk intent carries no codes")
        val expiresAt =
            body["expiresAt"]?.takeIf { it !is JsonNull }?.jsonPrimitive?.content
        val normalized =
            LinksnapPayloads.bulk(
                action = action,
                codes = codes.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content },
                expiresAt = expiresAt,
            )
        return WriteRequest("POST", BULK_PATH, normalized)
    }
}

/**
 * How a LinkSnap write becomes an intent's payload (#654).
 *
 * The create and delete bodies are generated contract types, so a field the
 * server stops accepting is a compile error in the app rather than a queued
 * write that can never drain. An update is built field by field because the
 * route distinguishes "absent" from "null": `null` clears an expiry or a
 * password, and a body that always carried null would clear both on every edit.
 */
object LinksnapPayloads {
    /** The encoder the create body uses: the route reads the keys it names. */
    val withNulls = Json {
        explicitNulls = true
        encodeDefaults = true
    }

    fun create(
        originalUrl: String,
        customCode: String,
        clientId: String,
        expiresAt: String?,
        password: String?,
        updatedAt: String,
    ): String =
        withNulls.encodeToString(
            LinksnapCreateWrite(
                originalUrl = originalUrl,
                customCode = customCode,
                clientId = clientId,
                expiresAt = expiresAt,
                password = password,
                updatedAt = updatedAt,
            )
        )

    /**
     * An edit, with the fields the caller actually changed. `expiresAtSet` and
     * `passwordSet` are what tell "leave it" from "clear it"; `deletedAtSet` is
     * the undo's resurrect.
     */
    fun update(
        code: String,
        clientId: String,
        newCode: String? = null,
        originalUrl: String? = null,
        expiresAtSet: Boolean = false,
        expiresAt: String? = null,
        passwordSet: Boolean = false,
        password: String? = null,
        updatedAt: String,
        deletedAtSet: Boolean = false,
        deletedAt: String? = null,
    ): String =
        buildJsonObject {
            put("code", code)
            put("clientId", clientId)
            if (newCode != null) put("newCode", newCode)
            if (originalUrl != null) put("originalUrl", originalUrl)
            if (expiresAtSet) {
                if (expiresAt == null) put("expiresAt", JsonNull) else put("expiresAt", expiresAt)
            }
            if (passwordSet) {
                if (password == null) put("password", JsonNull) else put("password", password)
            }
            put("updatedAt", updatedAt)
            if (deletedAtSet) {
                if (deletedAt == null) put("deletedAt", JsonNull) else put("deletedAt", deletedAt)
            }
        }.toString()

    /** The same pair the route deletes on, and the instant the delete was decided. */
    fun delete(code: String, clientId: String?, updatedAt: String): String =
        withNulls.encodeToString(
            LinksnapDeleteWrite(code = code, clientId = clientId, updatedAt = updatedAt)
        )

    /**
     * The bulk intent's payload (#942): the action, the slugs, the expiry for a
     * `setExpiry`, and the row identities the pull uses to leave a pending write
     * alone. The route reads only the first three - the endpoint looks the row
     * up by code and the session's user - so [LinksnapWriteTransport] rebuilds
     * the wire body without `clientIds`.
     */
    fun bulk(
        action: String,
        codes: List<String>,
        expiresAt: String? = null,
        clientIds: List<String> = emptyList(),
    ): String =
        buildJsonObject {
            put("action", action)
            put("codes", JsonArray(codes.map { JsonPrimitive(it) }))
            if (expiresAt != null) put("expiresAt", expiresAt)
            if (clientIds.isNotEmpty()) {
                put("clientIds", JsonArray(clientIds.map { JsonPrimitive(it) }))
            }
        }.toString()

    /** The unlock body: the slug from the route and the password a visitor typed. */
    fun unlock(code: String, password: String): String =
        withNulls.encodeToString(LinksnapUnlockRequest(code = code, password = password))
}
