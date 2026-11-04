package com.royaraqamia.app.quran

import com.royaraqamia.app.shell.Routes

/**
 * The Quran's routes as the app reads them (#955).
 *
 * `/quran` is the index and `/quran/<n>` is one sura. The sura number is the
 * site's own route param, and `#ayah-<n>` is the landing place a search hit, a
 * page jump or a resume card names; the shell keeps the fragment in the route and
 * the screen reads it here.
 */
object QuranRoutes {
    const val INDEX = "/quran"

    private val surahPattern = Regex("^/quran/(\\d+)$")
    private val ayahPattern = Regex("#ayah-(\\d+)")

    /** The sura number in `/quran/<n>`, or null when [path] is not one. */
    fun surahOf(path: String?): Int? {
        val route = Routes.normalize(path)
        val match = surahPattern.matchEntire(route) ?: return null
        val number = match.groupValues.getOrNull(1)?.toIntOrNull() ?: return null
        return number.takeIf { it in 1..AssetQuranRepository.QURAN_SURAH_COUNT }
    }

    /** The Ayah a `#ayah-<n>` fragment names, or null when there is none. */
    fun ayahOf(path: String?): Int? =
        ayahPattern.find(path.orEmpty())?.groupValues?.getOrNull(1)?.toIntOrNull()?.takeIf { it > 0 }

    /** Whether [path] is the index or a sura. */
    fun matches(path: String?): Boolean =
        Routes.normalize(path) == INDEX || surahOf(path) != null

    /** The route of one sura, without a landing place. */
    fun routeOf(surah: Int): String = "$INDEX/$surah"

    /** The route of one sura at one Ayah. */
    fun routeOf(surah: Int, ayah: Int): String = "${routeOf(surah)}#ayah-$ayah"
}
