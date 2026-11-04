package com.royaraqamia.app.quran

import android.content.Context

/**
 * Where the reader stopped, kept across a process kill (#955).
 *
 * SharedPreferences rather than a database: it is one row of three numbers, and
 * `commit()` is what makes "killed right after the write" keep it. The key is
 * plain rather than identity-scoped because the web's reading position is the
 * guest's until a session arrives (ADR-0056); the account-scoped sync is the
 * next slice, not this one.
 */
interface QuranPositionStore {
    fun read(): QuranReadingPosition?

    fun write(position: QuranReadingPosition)
}

class PreferencesQuranPositionStore(context: Context) : QuranPositionStore {
    private val preferences =
        context.getSharedPreferences("quran-reading-position", Context.MODE_PRIVATE)

    override fun read(): QuranReadingPosition? {
        val surah = preferences.getInt(KEY_SURAH, 0)
        val ayah = preferences.getInt(KEY_AYAH, 0)
        if (surah !in 1..AssetQuranRepository.QURAN_SURAH_COUNT || ayah < 1) return null
        return QuranReadingPosition(
            surah = surah,
            ayah = ayah,
            updatedAt = preferences.getString(KEY_UPDATED, null).orEmpty(),
        )
    }

    override fun write(position: QuranReadingPosition) {
        // `commit` rather than `apply`: a process killed between the write and the
        // next frame is exactly the case this store exists for.
        preferences
            .edit()
            .putInt(KEY_SURAH, position.surah)
            .putInt(KEY_AYAH, position.ayah)
            .putString(KEY_UPDATED, position.updatedAt)
            .commit()
    }

    private companion object {
        const val KEY_SURAH = "surah"
        const val KEY_AYAH = "ayah"
        const val KEY_UPDATED = "updatedAt"
    }
}
