package com.royaraqamia.app.home

import com.royaraqamia.app.contracts.generated.UpdateHomeServicesServicesItem
import com.royaraqamia.app.shell.ServicesEntry

/**
 * The homepage's apps, in the site's order (#1194, ADR-0146).
 *
 * The catalogue is [ServicesEntry.rows] — the same nine routes the strip and the
 * picker draw — and the write contract is the generated enum, built from the same
 * route list on the server (`shared/contracts/home-services-catalog.ts`). The
 * mapping below is an exhaustive `when` over the sealed entries, so an app the
 * catalogue gains without a key is a compile error rather than a picker row that
 * cannot be saved, and an enum the server renames is one too.
 *
 * A stored value the catalogue no longer has is dropped on read rather than
 * drawn as a tab that cannot open: an app retired from the picker leaves a row
 * behind, and that row is inert on the server exactly as it is here.
 */
object HomeServicesCatalog {
    val routes: List<String> = ServicesEntry.rows.map { it.route }

    /** The member's order, with unknown values and duplicates dropped. */
    fun sanitize(values: Iterable<String>): List<String> {
        val known = routes.toSet()
        val seen = LinkedHashSet<String>()
        for (value in values) {
            if (value in known) seen.add(value)
        }
        return seen.toList()
    }

    /**
     * The account's set first, then the device's apps that are not already on it.
     *
     * The merge is the site's (`merge` in `home-services-provider.tsx`): a member
     * who arranged a strip before signing in keeps that arrangement, and the
     * account's order is never shuffled by a sign-in.
     */
    fun merge(account: List<String>, guest: List<String>): List<String> =
        account + guest.filterNot { it in account }

    /** The contract key for a row the picker offers; null for a row it cannot add. */
    fun keyOf(entry: ServicesEntry): UpdateHomeServicesServicesItem? =
        when (entry) {
            ServicesEntry.News -> UpdateHomeServicesServicesItem.NEWS
            ServicesEntry.Rates -> UpdateHomeServicesServicesItem.RATES
            ServicesEntry.Scan -> UpdateHomeServicesServicesItem.SCAN
            ServicesEntry.Quran -> UpdateHomeServicesServicesItem.QURAN
            ServicesEntry.Athkar -> UpdateHomeServicesServicesItem.ATHKAR
            ServicesEntry.LinkSnap -> UpdateHomeServicesServicesItem.LINKSNAP
            ServicesEntry.HabitFlow -> UpdateHomeServicesServicesItem.HABITFLOW
            ServicesEntry.SpendTrack -> UpdateHomeServicesServicesItem.SPENDTRACK
            ServicesEntry.Notes -> UpdateHomeServicesServicesItem.NOTES
            // The trigger is the menu itself, and `/verify` and `/mcp/guide` left
            // the picker (ADR-0152): they keep their copy and glyph, never a slot.
            ServicesEntry.Trigger,
            ServicesEntry.Verify,
            ServicesEntry.McpGuide -> null
        }

    /** The contract key for a stored route, or null when no row draws it. */
    fun keyOf(route: String): UpdateHomeServicesServicesItem? =
        ServicesEntry.rows.firstOrNull { it.route == route }?.let(::keyOf)
}
