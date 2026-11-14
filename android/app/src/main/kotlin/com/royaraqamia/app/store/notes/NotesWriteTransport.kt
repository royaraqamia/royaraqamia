package com.royaraqamia.app.store.notes

import com.royaraqamia.app.contracts.generated.NoteDelete
import com.royaraqamia.app.contracts.generated.NoteUpdate
import com.royaraqamia.app.contracts.generated.NoteWrite
import com.royaraqamia.app.store.outbox.OutboxIntentRow
import com.royaraqamia.app.store.outbox.WriteRequest
import java.net.URLEncoder
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * A queued intent as the request the web's outbox sends (#1390).
 *
 * The endpoints are the ones `frontend/api/notes/sync-transport.ts` already
 * drains to, so the server keeps one implementation and the two clients cannot
 * disagree about what a create is: a create is `POST /notes/api/notes`, an edit
 * is `PATCH /notes/api/notes/<clientId>`, and a delete is a `DELETE` on the same
 * path with the write time as its body.
 */
object NotesWriteTransport {
    const val NOTES_PATH = "/notes/api/notes"

    fun requestFor(intent: OutboxIntentRow): WriteRequest = when (intent.type) {
        "note.create" -> WriteRequest("POST", NOTES_PATH, intent.payload)
        "note.update" -> updateRequest(intent.payload)
        "note.delete" -> deleteRequest(intent.payload)
        else -> throw IllegalArgumentException("Unknown outbox intent type: ${intent.type}")
    }

    private fun updateRequest(payload: String): WriteRequest {
        val clientId = clientIdOf(payload)
            ?: throw IllegalArgumentException("a note.update intent carries no clientId")
        return WriteRequest("PATCH", pathOf(clientId), payload)
    }

    /**
     * `DELETE /notes/api/notes/<clientId>` with `{"updatedAt": …}` as the body.
     *
     * The path segment is percent-encoded so an id can never break out of it, and
     * the body carries only the field the server reads.
     */
    private fun deleteRequest(payload: String): WriteRequest {
        val body = WritePayloads.withoutNulls.parseToJsonElement(payload)
        val clientId = body.jsonObject["clientId"]?.jsonPrimitive?.content
            ?: throw IllegalArgumentException("a note.delete intent carries no clientId")
        val updatedAt = body.jsonObject["updatedAt"]?.jsonPrimitive?.content
        val encoded =
            if (updatedAt == null) {
                WritePayloads.withoutNulls.encodeToString(NoteDelete())
            } else {
                WritePayloads.withoutNulls.encodeToString(NoteDelete(updatedAt = updatedAt))
            }
        return WriteRequest("DELETE", pathOf(clientId), encoded)
    }

    private fun clientIdOf(payload: String): String? =
        runCatching {
            WritePayloads.withoutNulls.parseToJsonElement(payload).jsonObject["clientId"]?.jsonPrimitive?.content
        }.getOrNull()

    private fun pathOf(clientId: String): String =
        "$NOTES_PATH/${URLEncoder.encode(clientId, "UTF-8")}"
}

/**
 * How a write becomes an intent's payload (#1390).
 *
 * The payload is a generated contract type, so a field the server stops
 * accepting is a compile error in the app rather than a queued write that can
 * never drain. The web's notes payloads carry `deletedAt: null` on an edit, which
 * is what revives a tombstone through the same route.
 */
object WritePayloads {
    /** Explicit nulls: an edit's `deletedAt` travels as `null`, as the web sends it. */
    val withNulls = Json {
        explicitNulls = true
        encodeDefaults = true
    }

    /** Omitted nulls: a delete carries only the write time. */
    val withoutNulls = Json {
        explicitNulls = false
        encodeDefaults = true
    }

    fun createNote(clientId: String, body: String, createdAt: String, updatedAt: String): String =
        withNulls.encodeToString(
            NoteWrite(
                body = body,
                createdAt = createdAt,
                clientId = clientId,
                updatedAt = updatedAt,
            )
        )

    fun updateNote(clientId: String, body: String, updatedAt: String): String =
        withNulls.encodeToString(
            NoteUpdate(
                body = body,
                clientId = clientId,
                updatedAt = updatedAt,
                deletedAt = null,
            )
        )

    /**
     * The delete intent's payload. It carries the row's key because the request
     * path is built from it, and the write time because the server compares it
     * with the stored stamp (ADR-0029).
     */
    fun deleteNote(clientId: String, updatedAt: String): String =
        "{\"clientId\":${Json.encodeToString(clientId)}," +
            "\"updatedAt\":${Json.encodeToString(updatedAt)}}"
}
