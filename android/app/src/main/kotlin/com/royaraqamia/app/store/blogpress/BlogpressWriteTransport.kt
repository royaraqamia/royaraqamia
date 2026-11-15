package com.royaraqamia.app.store.blogpress

import com.royaraqamia.app.contracts.generated.BlogpressDelete
import com.royaraqamia.app.contracts.generated.BlogpressPostSave
import com.royaraqamia.app.contracts.generated.RestorePostSnapshot
import com.royaraqamia.app.store.outbox.OutboxIntentRow
import com.royaraqamia.app.store.outbox.WriteRequest
import java.net.URLEncoder
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * A queued BlogPress intent as the request the web's Outbox sends (#952).
 *
 * The endpoints are the ones `frontend/api/community/sync-transport.ts` already
 * drains to, so the server keeps one implementation and the two clients cannot
 * disagree about what a delete is. A delete is a `DELETE` whose id rides in the
 * path and whose body carries only the write time, which is the shape the route
 * reads for its tombstone. An undo is the restore route the web calls, carrying
 * the tombstone's id and the stamp the delete wrote — never the body (#1518).
 */
object BlogpressWriteTransport {
    const val POSTS_PATH = "/api/community/posts"
    const val RESTORE_PATH = "$POSTS_PATH/restore"

    fun requestFor(intent: OutboxIntentRow): WriteRequest = when (intent.type) {
        "post.save" -> saveRequest(intent.payload)
        "post.delete" -> deleteRequest(intent.payload)
        "post.restore" -> WriteRequest("POST", RESTORE_PATH, intent.payload)
        else -> throw IllegalArgumentException("Unknown outbox intent type: ${intent.type}")
    }

    /**
     * `PATCH /api/community/posts/{id}` with the editor's five fields.
     *
     * The id rides in the path and in the body: the path is what the route reads,
     * and the body is the generated save shape the server's schema validates. A
     * save carries the logical write time, so a replay older than the row loses
     * at the server instead of overwriting a newer draft (ADR-0029).
     */
    private fun saveRequest(payload: String): WriteRequest {
        val body = BlogpressPayloads.withNulls.parseToJsonElement(payload).jsonObject
        val id =
            body["id"]?.jsonPrimitive?.content
                ?: throw IllegalArgumentException("a post.save intent carries no id")
        return WriteRequest(
            method = "PATCH",
            path = "$POSTS_PATH/${URLEncoder.encode(id, "UTF-8")}",
            body = payload,
        )
    }

    /**
     * `DELETE /api/community/posts/{id}` with `{"updatedAt": …}` as the body.
     *
     * Only the field the route reads travels: the rest of the payload would be a
     * lie about what a delete does, and the server would have to ignore it.
     */
    private fun deleteRequest(payload: String): WriteRequest {
        val body = BlogpressPayloads.withNulls.parseToJsonElement(payload).jsonObject
        val id =
            body["id"]?.jsonPrimitive?.content
                ?: throw IllegalArgumentException("a post.delete intent carries no id")
        val updatedAt =
            body["updatedAt"]?.jsonPrimitive?.content
                ?: throw IllegalArgumentException("a post.delete intent carries no updatedAt")
        return WriteRequest(
            method = "DELETE",
            path = "$POSTS_PATH/${URLEncoder.encode(id, "UTF-8")}",
            body = BlogpressPayloads.withNulls.encodeToString(
                BlogpressDelete(id = id, updatedAt = updatedAt)
            ),
        )
    }
}

/**
 * How a BlogPress write becomes an intent's payload (#952).
 *
 * The payload is a generated contract type, so a field the server stops
 * accepting is a compile error in the app rather than a queued write that can
 * never drain. `explicitNulls` is on so a save's `null`-able editor field
 * travels as the `null` the schema accepts rather than vanishing from the body.
 * `encodeDefaults` is off so an optional key the app has no value for is left
 * out instead of travelling as an explicit `null`.
 */
object BlogpressPayloads {
    /** The encoder both the payloads and the delete body use. */
    val withNulls = Json {
        explicitNulls = true
        encodeDefaults = false
    }

    fun delete(id: String, updatedAt: String): String =
        withNulls.encodeToString(BlogpressDelete(id = id, updatedAt = updatedAt))

    /** The editor's autosave as the `PATCH` body the page's own save sends (#954). */
    fun save(row: BlogpressPostRow): String =
        withNulls.encodeToString(
            BlogpressPostSave(
                id = row.id,
                clientId = row.clientId,
                slug = row.slug,
                content = row.content,
                cover_image = row.coverImage,
                meta_title = row.metaTitle,
                meta_desc = row.metaDesc,
                updatedAt = row.updatedAt,
            )
        )

    /**
     * Which tombstone an undo revives, and the stamp the delete wrote (#1518).
     *
     * The body does not travel: the row the delete tombstoned still holds it,
     * along with its metadata, its tags and every server-owned column, so the
     * revive has nothing to copy back. `updatedAt` is the tombstone's stamp —
     * the same one the delete intent sent — so the server can refuse an undo
     * whose row has moved on instead of reviving a post the member is no longer
     * looking at. Sending it also keeps this client off the "no token" path an
     * older bundle takes.
     */
    fun restore(row: BlogpressPostRow): String =
        withNulls.encodeToString(
            RestorePostSnapshot(
                id = row.id,
                slug = row.slug,
                updatedAt = row.updatedAt,
            )
        )
}
