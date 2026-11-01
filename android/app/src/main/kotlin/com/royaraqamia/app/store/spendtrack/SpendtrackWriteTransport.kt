package com.royaraqamia.app.store.spendtrack

import com.royaraqamia.app.contracts.generated.SpendtrackCategoryUpdate
import com.royaraqamia.app.contracts.generated.SpendtrackCategoryWrite
import com.royaraqamia.app.contracts.generated.SpendtrackDelete
import com.royaraqamia.app.contracts.generated.SpendtrackExpenseUpdate
import com.royaraqamia.app.contracts.generated.SpendtrackExpenseUpdateSplitsItem
import com.royaraqamia.app.contracts.generated.SpendtrackExpenseWrite
import com.royaraqamia.app.contracts.generated.SpendtrackExpenseWriteSplitsItem
import com.royaraqamia.app.store.outbox.OutboxIntentRow
import com.royaraqamia.app.store.outbox.WriteRequest
import java.net.URLEncoder
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * A queued SpendTrack intent as the request the web's outbox sends (#653).
 *
 * The endpoints are the ones `frontend/api/spendtrack/sync-transport.ts` already
 * drains to, so the server keeps one implementation and the two clients cannot
 * disagree about what a create is. `id` is the client-minted row id, adopted
 * server-side as the primary key, so a replayed write is an idempotent upsert —
 * a create whose acknowledgement was lost can be sent again.
 *
 * A delete is a `DELETE` whose id rides in the path and whose body carries only
 * the write time, which is the shape the route reads for its tombstone.
 */
object SpendtrackWriteTransport {
    const val EXPENSES_PATH = "/spendtrack/api/expenses"
    const val CATEGORIES_PATH = "/spendtrack/api/categories"

    fun requestFor(intent: OutboxIntentRow): WriteRequest = when (intent.type) {
        "expense.create" -> WriteRequest("POST", EXPENSES_PATH, intent.payload)
        "expense.update" -> WriteRequest("PATCH", pathFor(EXPENSES_PATH, intent), intent.payload)
        "expense.delete" -> deleteRequest(EXPENSES_PATH, intent.payload)
        "category.create" -> WriteRequest("POST", CATEGORIES_PATH, intent.payload)
        "category.update" -> WriteRequest("PATCH", pathFor(CATEGORIES_PATH, intent), intent.payload)
        "category.delete" -> deleteRequest(CATEGORIES_PATH, intent.payload)
        else -> throw IllegalArgumentException("Unknown outbox intent type: ${intent.type}")
    }

    /**
     * `DELETE /spendtrack/api/expenses/{id}` with `{"updatedAt": …}` as the body.
     *
     * Only the field the route reads travels: the rest of the payload would be a
     * lie about what a delete does, and the server would have to ignore it.
     */
    private fun deleteRequest(base: String, payload: String): WriteRequest {
        val body = SpendtrackPayloads.withNulls.parseToJsonElement(payload).jsonObject
        val id =
            body["id"]?.jsonPrimitive?.content
                ?: throw IllegalArgumentException("a delete intent carries no id")
        val updatedAt =
            body["updatedAt"]?.jsonPrimitive?.content
                ?: throw IllegalArgumentException("a delete intent carries no updatedAt")
        return WriteRequest(
            method = "DELETE",
            path = pathFor(base, id),
            body = SpendtrackPayloads.withNulls.encodeToString(
                SpendtrackDelete(id = id, updatedAt = updatedAt)
            ),
        )
    }

    /** `{base}/{id}`, with the id percent-encoded so it cannot break out of the segment. */
    private fun pathFor(base: String, intent: OutboxIntentRow): String {
        val body = SpendtrackPayloads.withNulls.parseToJsonElement(intent.payload).jsonObject
        val id =
            body["id"]?.jsonPrimitive?.content
                ?: throw IllegalArgumentException("a ${intent.type} intent carries no id")
        return pathFor(base, id)
    }

    private fun pathFor(base: String, id: String): String =
        "$base/${URLEncoder.encode(id, "UTF-8")}"
}

/**
 * How a SpendTrack write becomes an intent's payload (#653).
 *
 * The payload is a generated contract type, so a field the server stops
 * accepting is a compile error in the app rather than a queued write that can
 * never drain. `explicitNulls` is on because the site's `JSON.stringify` sends
 * `null` for an unset description or currency, and the routes read the key.
 */
object SpendtrackPayloads {
    /** The encoder both the payloads and the delete body use. */
    val withNulls = Json {
        explicitNulls = true
        encodeDefaults = true
    }

    fun createExpense(
        clientId: String,
        amount: Double,
        categoryId: String,
        date: String,
        description: String?,
        currency: String?,
        splits: List<SpendtrackExpenseWriteSplitsItem>,
        updatedAt: String,
    ): String =
        withNulls.encodeToString(
            SpendtrackExpenseWrite(
                clientId = clientId,
                amount = amount,
                category_id = categoryId,
                date = date,
                description = description,
                currency = currency,
                splits = splits,
                updatedAt = updatedAt,
            )
        )

    /** An edit: the write above, its id, and `deletedAt: null` so an undo resurrects the row. */
    fun updateExpense(
        id: String,
        clientId: String,
        amount: Double,
        categoryId: String,
        date: String,
        description: String?,
        currency: String?,
        splits: List<SpendtrackExpenseWriteSplitsItem>,
        updatedAt: String,
    ): String =
        withNulls.encodeToString(
            SpendtrackExpenseUpdate(
                id = id,
                clientId = clientId,
                amount = amount,
                category_id = categoryId,
                date = date,
                description = description,
                currency = currency,
                // The generator emits one split class per schema that carries an
                // array of them, so the create's list is mapped onto the update's.
                // One shape in `shared/contracts/spendtrack.ts`, two class names.
                splits = splits.map { SpendtrackExpenseUpdateSplitsItem(it.category_id, it.amount, it.clientId) },
                updatedAt = updatedAt,
                deletedAt = null,
            )
        )

    fun createCategory(clientId: String, name: String, colorHex: String, updatedAt: String): String =
        withNulls.encodeToString(
            SpendtrackCategoryWrite(
                clientId = clientId,
                name = name,
                color_hex = colorHex,
                updatedAt = updatedAt,
            )
        )

    fun updateCategory(id: String, name: String, colorHex: String, updatedAt: String): String =
        withNulls.encodeToString(
            SpendtrackCategoryUpdate(
                id = id,
                name = name,
                color_hex = colorHex,
                updatedAt = updatedAt,
            )
        )

    /** `{"id": …, "updatedAt": …}`: what a delete carries, and nothing else. */
    fun delete(id: String, updatedAt: String): String =
        withNulls.encodeToString(SpendtrackDelete(id = id, updatedAt = updatedAt))
}
