package com.royaraqamia.app.store.habitflow

import java.net.URLEncoder
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import com.royaraqamia.app.contracts.generated.HabitLogWrite
import com.royaraqamia.app.contracts.generated.HabitUpdate
import com.royaraqamia.app.contracts.generated.HabitWrite
import com.royaraqamia.app.contracts.generated.HabitWriteFrequency

/** One HTTP request a queued intent becomes. */
data class WriteRequest(val method: String, val path: String, val body: String?)

/**
 * A queued intent as the request the web's outbox sends (#650).
 *
 * The endpoints are the ones `frontend/api/habitflow/sync-transport.ts` already
 * drains to, so the server keeps one implementation and the two clients cannot
 * disagree about what a create is. The payload is forwarded as stored, except
 * for a delete: that one is a `DELETE` whose body carries the write time, and its
 * id rides in the query, exactly as the web sends it.
 *
 * `shared/fixtures/offline-writes/habitflow.json`'s `requests` cases pin every
 * method and path here, and the app's suite reads the same cases.
 */
object HabitWriteTransport {
    const val HABITS_PATH = "/habitflow/api/habits"
    const val LOGS_PATH = "/habitflow/api/logs"

    fun requestFor(intent: OutboxIntentRow): WriteRequest = when (intent.type) {
        "habit.create" -> WriteRequest("POST", HABITS_PATH, intent.payload)
        "habit.update" -> WriteRequest("PUT", HABITS_PATH, intent.payload)
        "habit.delete" -> deleteRequest(intent.payload)
        "log.toggle" -> WriteRequest("POST", LOGS_PATH, intent.payload)
        else -> throw IllegalArgumentException("Unknown outbox intent type: ${intent.type}")
    }

    /**
     * `DELETE /habitflow/api/habits?id=…` with `{"updatedAt": …}` as the body.
     *
     * The path segment is percent-encoded so an id can never break out of it,
     * and the body carries only the field the server reads — the rest of the
     * payload would be a lie about what a delete does.
     */
    private fun deleteRequest(payload: String): WriteRequest {
        val body = WritePayloads.withoutNulls.parseToJsonElement(payload)
        val id = body.jsonObject["id"]?.jsonPrimitive?.content
            ?: throw IllegalArgumentException("a habit.delete intent carries no id")
        val updatedAt = body.jsonObject["updatedAt"]?.jsonPrimitive?.content
        return WriteRequest(
            method = "DELETE",
            path = "$HABITS_PATH?id=${URLEncoder.encode(id, "UTF-8")}",
            body = if (updatedAt == null) null else """{"updatedAt":"$updatedAt"}""",
        )
    }
}

/**
 * How a write becomes an intent's payload (#650).
 *
 * The payload is a generated contract type, so a field the server stops
 * accepting is a compile error in the app rather than a queued write that can
 * never drain. Two encoders, because the web's two payload shapes differ:
 *
 * - a habit carries `target`, `targetPeriod` and `reminderTime` explicitly as
 *   `null` when they are unset (the schema allows null), and the site sends them;
 * - a log's `kind` and `note` are `.optional()` but **not** nullable, so sending
 *   `null` is a 400. Those keys are omitted when unset, which is what the site
 *   does too.
 */
object WritePayloads {
    /** Explicit nulls: a habit's unset extras travel as `null`, as the web sends them. */
    val withNulls = Json {
        explicitNulls = true
        encodeDefaults = true
    }

    /** Omitted nulls: a log's unset `kind`/`note` are absent, not null. */
    val withoutNulls = Json {
        explicitNulls = false
        encodeDefaults = true
    }

    fun createHabit(
        clientId: String,
        name: String,
        updatedAt: String,
        reminderTime: String? = null,
    ): String =
        withNulls.encodeToString(
            HabitWrite(
                clientId = clientId,
                name = name,
                frequency = HabitWriteFrequency.DAILY,
                target = null,
                targetPeriod = null,
                reminderTime = reminderTime,
                updatedAt = updatedAt,
            )
        )

    fun toggleLog(
        clientId: String,
        habitId: String,
        date: String,
        completed: Boolean,
        updatedAt: String,
    ): String =
        withoutNulls.encodeToString(
            HabitLogWrite(
                clientId = clientId,
                habitId = habitId,
                date = date,
                completed = completed,
                kind = null,
                note = null,
                updatedAt = updatedAt,
            )
        )

    /** `{"id": …, "updatedAt": …}`: what a delete carries, and nothing else. */
    fun deleteHabit(id: String, updatedAt: String): String =
        withoutNulls.encodeToString(HabitUpdate(id = id, updatedAt = updatedAt))
}
