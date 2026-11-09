package com.royaraqamia.app.quran

import com.royaraqamia.app.QuranPlayerSnapshot
import com.royaraqamia.app.QuranPlayerStatus

/**
 * The faces the recitation panel draws (#956).
 *
 * The panel is a view over the service, so its faces are the service's states,
 * not a second state machine: a sura the controller is not on is [Idle] whatever
 * the service is doing elsewhere, exactly as the page's float is "listen to this
 * one" while another sura sounds.
 *
 * Declared for `check:parity`, which fails a state that exists on one side only.
 * The two clients paint these from `shared/copy/quran-player.json`.
 */
sealed interface QuranPlayerFace {
    /** Nothing sounding for this sura: the one "listen" control. */
    data object Idle : QuranPlayerFace

    /** The load is in flight; the primary control waits. */
    data object Loading : QuranPlayerFace

    /** The sura is sounding, at [ayah] of [ayahCount]. */
    data class Playing(
        val name: String,
        val ayah: Int,
        val ayahCount: Int,
        val positionSeconds: Double = 0.0,
        val durationSeconds: Double = 0.0,
    ) : QuranPlayerFace

    /** The sura is held, paused, at [ayah] of [ayahCount]. */
    data class Paused(
        val name: String,
        val ayah: Int,
        val ayahCount: Int,
        val positionSeconds: Double = 0.0,
        val durationSeconds: Double = 0.0,
    ) : QuranPlayerFace

    /** Nothing streamable: the sura is not on this device and there is no network. */
    data object Offline : QuranPlayerFace

    /** The service refused the file for a reason that is not the connection. */
    data object Failed : QuranPlayerFace

    companion object {
        /** The face [snapshot] paints on the reader for [surah]. */
        fun of(surah: Int, snapshot: QuranPlayerSnapshot): QuranPlayerFace {
            if (snapshot.surah != null && snapshot.surah != surah) return Idle
            return when (snapshot.status) {
                QuranPlayerStatus.LOADING -> Loading
                QuranPlayerStatus.PLAYING ->
                    Playing(
                        snapshot.name.orEmpty(),
                        snapshot.ayah,
                        snapshot.ayahCount,
                        snapshot.positionSeconds,
                        snapshot.durationSeconds,
                    )
                QuranPlayerStatus.PAUSED ->
                    Paused(
                        snapshot.name.orEmpty(),
                        snapshot.ayah,
                        snapshot.ayahCount,
                        snapshot.positionSeconds,
                        snapshot.durationSeconds,
                    )
                QuranPlayerStatus.OFFLINE -> Offline
                QuranPlayerStatus.FAILED -> Failed
                QuranPlayerStatus.IDLE -> Idle
            }
        }
    }
}
