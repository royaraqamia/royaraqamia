package com.royaraqamia.app.athkar

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * The Athkar reader's data seam (#1389).
 *
 * The screen asks for a sitting and for today's counts, and never learns that
 * the text is an asset and the counts are a preference: the text is vendored, so
 * the reader opens with no network at all (ADR-0057), and the count is the
 * device's own daily checklist, the same one `frontend/ui/athkar/count-store.ts`
 * keeps in `localStorage` on the page.
 */
interface AthkarRepository {
    fun collection(period: AthkarPeriod): AthkarCollection

    fun counts(): AthkarCounts

    fun increment(period: AthkarPeriod, id: String, target: Int): AthkarCounts

    fun reset(period: AthkarPeriod, id: String): AthkarCounts
}

/**
 * Today's counts, keyed by dhikr id, per sitting.
 *
 * A record belongs to one local calendar day and dies at midnight: a count read
 * on another day is yesterday's checklist and reads as zero. The day key is the
 * device's local date, never UTC - the page's own store records why.
 */
data class AthkarCounts(
    val day: String,
    val morning: Map<String, Int> = emptyMap(),
    val evening: Map<String, Int> = emptyMap(),
) {
    fun forPeriod(period: AthkarPeriod): Map<String, Int> =
        when (period) {
            AthkarPeriod.Morning -> morning
            AthkarPeriod.Evening -> evening
        }

    /** The count to draw: never negative, never past the narration's number. */
    fun countFor(period: AthkarPeriod, id: String, limit: Int): Int {
        val stored = forPeriod(period)[id] ?: 0
        if (stored <= 0) return 0
        return stored.coerceAtMost(limit.coerceAtLeast(0))
    }
}

/** The app's reader, reading the files the build copies from `data/athkar`. */
class AssetAthkarRepository(
    context: Context,
    private val store: AthkarCountStore = PreferencesAthkarCountStore(context),
) : AthkarRepository {
    private val assets = context.assets
    private val json = Json { ignoreUnknownKeys = true }
    private val loaded = mutableMapOf<AthkarPeriod, AthkarCollection>()

    override fun collection(period: AthkarPeriod): AthkarCollection =
        loaded.getOrPut(period) {
            assets.open("athkar/${period.key}.json").bufferedReader().use { reader ->
                json.decodeFromString(AthkarCollection.serializer(), reader.readText())
            }
        }

    override fun counts(): AthkarCounts = store.read()

    override fun increment(period: AthkarPeriod, id: String, target: Int): AthkarCounts {
        val current = store.read()
        val count = current.countFor(period, id, target)
        val next = count + 1
        if (next > target.coerceAtLeast(1)) return current
        val updated = current.withCount(period, id, next)
        store.write(updated)
        return updated
    }

    override fun reset(period: AthkarPeriod, id: String): AthkarCounts {
        val current = store.read()
        val updated = current.withCount(period, id, 0)
        store.write(updated)
        return updated
    }

    private fun AthkarCounts.withCount(period: AthkarPeriod, id: String, count: Int): AthkarCounts {
        val next =
            when (period) {
                AthkarPeriod.Morning -> morning.toMutableMap()
                AthkarPeriod.Evening -> evening.toMutableMap()
            }
        if (count <= 0) next.remove(id) else next[id] = count
        return when (period) {
            AthkarPeriod.Morning -> copy(morning = next)
            AthkarPeriod.Evening -> copy(evening = next)
        }
    }
}

/** Where the device keeps today's checklist. */
interface AthkarCountStore {
    fun read(): AthkarCounts

    fun write(counts: AthkarCounts)
}

/**
 * The device's own store, a `SharedPreferences` record of one day.
 *
 * `commit()` rather than `apply()`: a process killed right after a tap is the
 * case the store exists for. A stored record for another day reads as an empty
 * day rather than as yesterday's count, which is what makes a tab left open
 * overnight start fresh.
 */
class PreferencesAthkarCountStore(context: Context) : AthkarCountStore {
    private val preferences = context.getSharedPreferences("athkar-counts", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    override fun read(): AthkarCounts {
        val today = todayKey()
        val raw = preferences.getString(KEY_COUNTS, null) ?: return AthkarCounts(today)
        val parsed =
            runCatching { json.decodeFromString(StoredAthkarCounts.serializer(), raw) }.getOrNull()
                ?: return AthkarCounts(today)
        if (parsed.day != today) return AthkarCounts(today)
        return AthkarCounts(
            day = today,
            morning = parsed.morning.filterValues { it > 0 },
            evening = parsed.evening.filterValues { it > 0 },
        )
    }

    override fun write(counts: AthkarCounts) {
        val stored =
            StoredAthkarCounts(
                day = counts.day,
                morning = counts.morning.filterValues { it > 0 },
                evening = counts.evening.filterValues { it > 0 },
            )
        preferences.edit().putString(KEY_COUNTS, json.encodeToString(stored)).commit()
    }

    private fun todayKey(): String = java.time.LocalDate.now().toString()

    private companion object {
        const val KEY_COUNTS = "counts"
    }
}

@Serializable private data class StoredAthkarCounts(
    val day: String,
    val morning: Map<String, Int> = emptyMap(),
    val evening: Map<String, Int> = emptyMap(),
)
