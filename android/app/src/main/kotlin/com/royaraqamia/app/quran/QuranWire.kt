package com.royaraqamia.app.quran

import kotlinx.serialization.Serializable

/**
 * The wire shapes of the reader's two owned records (#1751).
 *
 * These are the bodies `POST /quran/api/position` and
 * `POST /quran/api/bookmarks` accept, and the body `GET /quran/api/sync`
 * returns — the routes `shared/contracts/quran.ts` defines for the site. They
 * are named here rather than retyped as JSON strings so a field the server
 * stops accepting is a compile error in the app, not a queued write that can
 * never drain.
 *
 * `clientId` is the id the device minted (`uuidv7`, the same shape the web
 * mints), and `updatedAt` is the last-write-wins stamp (ADR-0029). A bookmark's
 * `deletedAt` is a tombstone: null marks or re-marks, an instant removes
 * (ADR-0033).
 */
@Serializable
data class QuranPositionWriteWire(
    val surah: Int,
    val ayah: Int,
    val clientId: String,
    val updatedAt: String? = null,
)

@Serializable
data class QuranBookmarkWriteWire(
    val surah: Int,
    val ayah: Int,
    val deletedAt: String? = null,
    val clientId: String,
    val updatedAt: String? = null,
)

/** The pulled position, which is null until the reader starts anywhere. */
@Serializable
data class QuranSyncPositionWire(val surah: Int, val ayah: Int, val updatedAt: String)

/** Tombstones are included: a mark removed on another device has to arrive here. */
@Serializable
data class QuranSyncBookmarkWire(
    val clientId: String,
    val surah: Int,
    val ayah: Int,
    val createdAt: String,
    val updatedAt: String,
    val deletedAt: String? = null,
)

@Serializable
data class QuranSyncSnapshotWire(
    val position: QuranSyncPositionWire? = null,
    val bookmarks: List<QuranSyncBookmarkWire> = emptyList(),
    val cursor: String? = null,
)
