package com.royaraqamia.app.store.habitflow

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The Outbox's write semantics, from the app's side (#650).
 *
 * The same `shared/fixtures/offline-writes/habitflow.json` the web suite runs
 * (`shared/fixtures/__tests__/offline-writes.test.ts`) is the source of every
 * case: replay order, backoff, the permanent/transient split, what "drained"
 * means, which request an intent becomes, and who wins a conflict. A rule the two
 * engines answer differently fails one of the two suites, which is what
 * `docs/mobile/two-clients.md`'s third rule asks for.
 */
class OutboxFixturesTest {
    private val fixture: JsonObject = Json.parseToJsonElement(File(path()).readText()).jsonObject
    private val cases: JsonObject = fixture.getValue("cases").jsonObject

    @Test
    fun `runs the queue the web runs`() {
        assertEquals("habitflow", fixture.getValue("product").jsonPrimitive.content)
        assertTrue("the fixture has no drain cases", cases.getValue("drain").jsonArray.isNotEmpty())
    }

    @Test
    fun `backs off with full jitter, capped`() {
        for (case in cases.getValue("backoff").jsonArray.map { it.jsonObject }) {
            val attempts = case.getValue("attempts").jsonPrimitive.int
            val random = case.getValue("random").jsonPrimitive.content.toDouble()
            val expected = case.getValue("delayMs").jsonPrimitive.long
            assertEquals("attempts=$attempts", expected, OutboxRules.backoffDelay(attempts, random))
        }
    }

    @Test
    fun `replays only a pending intent whose time has come`() {
        for (case in cases.getValue("due").jsonArray.map { it.jsonObject }) {
            val entry = case.getValue("entry").jsonObject
            val now = case.getValue("now").jsonPrimitive.long
            val due = case.getValue("due").jsonPrimitive.boolean
            assertEquals(
                case.getValue("name").jsonPrimitive.content,
                due,
                OutboxRules.isDue(
                    status = entry.getValue("status").jsonPrimitive.content,
                    nextAttemptAt = entry.getValue("nextAttemptAt").jsonPrimitive.long,
                    now = now,
                ),
            )
        }
    }

    @Test
    fun `resolves a pull the way the web's merge does`() {
        for (case in cases.getValue("conflict").jsonArray.map { it.jsonObject }) {
            val localElement = case["local"]
            val local =
                if (localElement == null || localElement is JsonNull) null else localElement.jsonObject
            val server = case.getValue("server").jsonObject
            val winner =
                OutboxRules.conflictWinner(
                    localUpdatedAt = local?.get("updatedAt")?.takeUnless { it is JsonNull }?.jsonPrimitive?.content,
                    serverUpdatedAt =
                        server["updatedAt"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content,
                    pending = case.getValue("pending").jsonPrimitive.boolean,
                )
            val expected =
                when (case.getValue("keep").jsonPrimitive.content) {
                    "server" -> ConflictWinner.Server
                    else -> ConflictWinner.Local
                }
            assertEquals(case.getValue("name").jsonPrimitive.content, expected, winner)
        }
    }

    @Test
    fun `replays every intent to the endpoint the web replays to`() {
        for (case in cases.getValue("requests").jsonArray.map { it.jsonObject }) {
            val type = case.getValue("type").jsonPrimitive.content
            val payload = case.getValue("payload")
            val request =
                HabitWriteTransport.requestFor(
                    OutboxIntentRow(
                        id = "intent",
                        entity = type.substringBefore('.'),
                        type = type,
                        payload = payload.toString(),
                        createdAt = 0,
                        attempts = 0,
                        status = OutboxIntentRow.STATUS_PENDING,
                        lastError = null,
                        nextAttemptAt = 0,
                    )
                )
            val expected = case.getValue("request").jsonObject
            val name = case.getValue("name").jsonPrimitive.content

            assertEquals(name, expected.getValue("method").jsonPrimitive.content, request.method)
            assertEquals(name, expected.getValue("path").jsonPrimitive.content, request.path)
            val expectedBody = expected["body"] ?: payload
            assertNotNull("$name: no body sent", request.body)
            assertEquals(name, json(expectedBody.toString()), json(request.body!!))
        }
    }

    @Test
    fun `builds the payloads the web builds`() {
        val requests = cases.getValue("requests").jsonArray.map { it.jsonObject }
        fun payloadFor(type: String): JsonObject =
            requests.first { it.getValue("type").jsonPrimitive.content == type }
                .getValue("payload")
                .jsonObject

        val create = payloadFor("habit.create")
        assertEquals(
            create,
            json(
                WritePayloads.createHabit(
                    clientId = create.getValue("clientId").jsonPrimitive.content,
                    name = create.getValue("name").jsonPrimitive.content,
                    updatedAt = create.getValue("updatedAt").jsonPrimitive.content,
                    reminderTime = create["reminderTime"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content,
                )
            ),
        )

        val toggle = payloadFor("log.toggle")
        assertEquals(
            toggle,
            json(
                WritePayloads.toggleLog(
                    clientId = toggle.getValue("clientId").jsonPrimitive.content,
                    habitId = toggle.getValue("habitId").jsonPrimitive.content,
                    date = toggle.getValue("date").jsonPrimitive.content,
                    completed = toggle.getValue("completed").jsonPrimitive.boolean,
                    updatedAt = toggle.getValue("updatedAt").jsonPrimitive.content,
                )
            ),
        )

        val delete = payloadFor("habit.delete")
        assertEquals(
            delete,
            json(
                WritePayloads.deleteHabit(
                    id = delete.getValue("id").jsonPrimitive.content,
                    updatedAt = delete.getValue("updatedAt").jsonPrimitive.content,
                )
            ),
        )
    }

    @Test
    fun `drains, backs off and surfaces failures the way the web does`() = runBlocking {
        for (case in cases.getValue("drain").jsonArray.map { it.jsonObject }) {
            val name = case.getValue("name").jsonPrimitive.content
            val entries = case.getValue("entries").jsonArray.map { it.jsonObject.toIntent() }
            val outcomes =
                case.getValue("outcomes").jsonObject.mapValues {
                    when (it.value.jsonPrimitive.content) {
                        "accepted" -> SendOutcome.Accepted
                        "permanent" -> SendOutcome.Permanent
                        else -> SendOutcome.Transient
                    }
                }
            val expected = case.getValue("expect").jsonObject
            val queue = MemoryQueue(entries)
            val sent = mutableListOf<Long>()
            val now = case.getValue("now").jsonPrimitive.long
            val random = case.getValue("random").jsonPrimitive.content.toDouble()

            OutboxDrainer(
                queue = queue,
                send = { entry ->
                    sent += entry.seq
                    outcomes[entry.seq.toString()] ?: SendOutcome.Accepted
                },
                signedIn = { true },
                online = { case.getValue("online").jsonPrimitive.boolean },
                now = { now },
                random = { random },
            ).drain()

            assertEquals(
                "$name: sent",
                expected.getValue("sent").jsonArray.map { it.jsonPrimitive.long },
                sent,
            )
            assertEquals(
                "$name: kept",
                expected.getValue("kept").jsonArray.map { it.jsonObject.toIntentSummary() },
                queue.entries().map { it.toIntentSummary() },
            )
        }
    }

    private fun json(text: String): JsonObject = Json.parseToJsonElement(text).jsonObject

    private fun JsonObject.toIntent(): OutboxIntentRow =
        OutboxIntentRow(
            seq = getValue("seq").jsonPrimitive.long,
            id = "intent-${getValue("seq").jsonPrimitive.long}",
            entity = getValue("type").jsonPrimitive.content.substringBefore('.'),
            type = getValue("type").jsonPrimitive.content,
            payload = "{}",
            createdAt = 0,
            attempts = getValue("attempts").jsonPrimitive.int,
            status = getValue("status").jsonPrimitive.content,
            lastError = null,
            nextAttemptAt = getValue("nextAttemptAt").jsonPrimitive.long,
        )

    /** The three fields the fixture pins; `lastError` is each client's own words. */
    private fun OutboxIntentRow.toIntentSummary(): String =
        "$seq|$status|$attempts|$nextAttemptAt"

    private fun JsonObject.toIntentSummary(): String =
        "${getValue("seq").jsonPrimitive.long}|" +
            "${getValue("status").jsonPrimitive.content}|" +
            "${getValue("attempts").jsonPrimitive.int}|" +
            "${getValue("nextAttemptAt").jsonPrimitive.long}"

    private class MemoryQueue(entries: List<OutboxIntentRow>) : OutboxQueue {
        private var rows: List<OutboxIntentRow> = entries.sortedBy { it.seq }

        override suspend fun entries(): List<OutboxIntentRow> = rows

        override suspend fun remove(seq: Long) {
            rows = rows.filterNot { it.seq == seq }
        }

        override suspend fun patch(
            entry: OutboxIntentRow,
            attempts: Int,
            status: String,
            lastError: String?,
            nextAttemptAt: Long,
        ) {
            rows =
                rows.map {
                    if (it.seq == entry.seq) {
                        it.copy(
                            attempts = attempts,
                            status = status,
                            lastError = lastError,
                            nextAttemptAt = nextAttemptAt,
                        )
                    } else {
                        it
                    }
                }
        }
    }

    private fun path(): String {
        val start = File(System.getProperty("user.dir") ?: ".").absoluteFile
        var candidate: File? = start
        while (candidate != null) {
            val fixture = File(candidate, "shared/fixtures/offline-writes/habitflow.json")
            if (fixture.isFile) return fixture.path
            candidate = candidate.parentFile
        }
        throw IllegalStateException("shared/fixtures/offline-writes/habitflow.json not found above $start")
    }
}
