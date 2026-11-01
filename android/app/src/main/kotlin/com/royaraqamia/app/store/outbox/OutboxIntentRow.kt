package com.royaraqamia.app.store.outbox

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * One queued write (#650): the durable record of "the user meant this", which is
 * removed only once the server has accepted it (ADR-0029).
 *
 * `seq` is the replay order, not a clock: writes made inside one millisecond
 * would otherwise replay in whatever order the database returned them, and an
 * undo after a delete would invert. Room's auto-increment is assigned in the
 * transaction that writes the row, so the order is the order the taps happened.
 *
 * `payload` is JSON rather than a typed column: the intent outlives an app
 * version, and a payload its reader no longer understands must be a permanent
 * failure the user can see, not a row the migration refuses to open. The shape
 * of the payload is a generated contract type
 * (`com.royaraqamia.app.contracts.generated.HabitWrite`, `HabitLogWrite`).
 *
 * `status` is the wire's own word (`pending` | `failed`) because it is also the
 * fixture's.
 */
@Entity(tableName = "outbox")
data class OutboxIntentRow(
    @PrimaryKey(autoGenerate = true) val seq: Long = 0,
    /** A UUID for logs and support: never a row's identity on the server. */
    val id: String,
    /** The owned entity the intent targets: `habit` | `habit_log`. */
    val entity: String,
    /** The replay discriminator: `habit.create`, `log.toggle`, … */
    val type: String,
    val payload: String,
    val createdAt: Long,
    val attempts: Int,
    val status: String,
    val lastError: String?,
    /** Epoch ms before which a retry must not run (exponential backoff). */
    val nextAttemptAt: Long,
) {
    companion object {
        const val STATUS_PENDING = "pending"
        const val STATUS_FAILED = "failed"

        /** An intent as a writer makes it; the store assigns `seq`. */
        fun pending(id: String, entity: String, type: String, payload: String, createdAt: Long) =
            OutboxIntentRow(
                id = id,
                entity = entity,
                type = type,
                payload = payload,
                createdAt = createdAt,
                attempts = 0,
                status = STATUS_PENDING,
                lastError = null,
                nextAttemptAt = 0,
            )
    }
}
