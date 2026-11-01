package com.royaraqamia.app.store.habitflow

import java.security.SecureRandom
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/**
 * The clock and the ids a queued write needs (#650).
 *
 * Both are injected rather than read at the call site, because a test that
 * asserts "the replay carries the same key" has to hold still: a real clock in
 * the assertion is the flake that hides a real race.
 */
interface WriteClock {
    /** An RFC 9562 version 7 UUID: time-ordered, so two ids sort by creation. */
    fun uuid(): String

    /** `2026-01-01T06:00:00.000Z`, the format the web's `toISOString()` writes. */
    fun nowIso(): String

    /** `2026-01-01`, the day a toggle is about, in the device's own zone. */
    fun today(): String
}

/** The clock the app ships. */
object SystemWriteClock : WriteClock {
    private val random = SecureRandom()

    override fun uuid(): String = uuidV7(System.currentTimeMillis(), random)

    override fun nowIso(): String = isoFormatter().format(java.util.Date())

    override fun today(): String {
        val calendar = Calendar.getInstance()
        return String.format(
            Locale.ROOT,
            "%04d-%02d-%02d",
            calendar.get(Calendar.YEAR),
            calendar.get(Calendar.MONTH) + 1,
            calendar.get(Calendar.DAY_OF_MONTH),
        )
    }

    private fun isoFormatter() =
        java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
}

/**
 * One version 7 UUID: 48 bits of millisecond timestamp, then randomness.
 *
 * The version matters because the web mints the same one (`uuidv7` in
 * `frontend/shared/local-store/uuid.ts`): it is the traceability id a queued
 * write carries through a replay, and a sort by it agrees with a sort by
 * creation time to the millisecond. The layout is RFC 9562's: the timestamp in
 * the first 48 bits, version 7 in the next nibble, variant `10` after it.
 */
fun uuidV7(millis: Long, random: SecureRandom): String {
    val bytes = ByteArray(16)
    random.nextBytes(bytes)
    for (index in 0 until 6) {
        bytes[5 - index] = ((millis ushr (index * 8)) and 0xFF).toByte()
    }
    // version 7
    bytes[6] = ((bytes[6].toInt() and 0x0F) or 0x70).toByte()
    // RFC variant
    bytes[8] = ((bytes[8].toInt() and 0x3F) or 0x80).toByte()

    var mostSignificant = 0L
    var leastSignificant = 0L
    for (index in 0 until 8) {
        mostSignificant = (mostSignificant shl 8) or (bytes[index].toLong() and 0xFF)
        leastSignificant = (leastSignificant shl 8) or (bytes[index + 8].toLong() and 0xFF)
    }
    return UUID(mostSignificant, leastSignificant).toString()
}
