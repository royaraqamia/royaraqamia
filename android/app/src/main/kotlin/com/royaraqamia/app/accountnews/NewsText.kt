package com.royaraqamia.app.accountnews

/**
 * The account news screen's words, in the page's order (#950, ADR-0098).
 *
 * Every sentence is a generated copy constant; this object only decides which
 * one a value goes into. The internal category, region and state keys are the
 * server's own words lowercased, so a value that arrives from a later schema is
 * shown as itself rather than crashing a screen the user is looking at.
 */
object NewsText {
    fun categoryLabel(category: String): String =
        when (category) {
            "tech" -> AccountNewsPreferencesCopy.CATEGORY_TECH
            "politics" -> AccountNewsPreferencesCopy.CATEGORY_POLITICS
            "religion" -> AccountNewsPreferencesCopy.CATEGORY_RELIGION
            "economy" -> AccountNewsPreferencesCopy.CATEGORY_ECONOMY
            "world" -> AccountNewsPreferencesCopy.CATEGORY_WORLD
            "other" -> AccountNewsPreferencesCopy.CATEGORY_OTHER
            else -> category
        }

    fun regionLabel(region: String): String =
        when (region) {
            "arab" -> AccountNewsPreferencesCopy.REGION_ARAB
            "islamic" -> AccountNewsPreferencesCopy.REGION_ISLAMIC
            "world" -> AccountNewsPreferencesCopy.REGION_WORLD
            else -> region
        }

    /** The one badge a row draws: a request's own state, or the feed's health. */
    fun ownedStateLabel(state: String): String =
        when (state) {
            "resolving" -> AccountNewsPrivateCopy.STATUS_RESOLVING
            "ready" -> AccountNewsPrivateCopy.STATUS_READY
            "needs_review" -> AccountNewsPrivateCopy.STATUS_NEEDS_REVIEW
            "rejected" -> AccountNewsPrivateCopy.STATUS_REJECTED
            "broken" -> AccountNewsPrivateCopy.STATUS_BROKEN
            else -> AccountNewsPrivateCopy.STATUS_LIVE
        }

    fun removeLabel(name: String): String =
        AccountNewsPrivateCopy.REMOVE_ARIA.replace("{name}", name)

    fun failureLabel(failure: String?): String? =
        when (failure) {
            "unsupported" -> AccountNewsPrivateCopy.FAILURE_UNSUPPORTED
            "no-feed" -> AccountNewsPrivateCopy.FAILURE_NO_FEED
            "unreachable" -> AccountNewsPrivateCopy.FAILURE_UNREACHABLE
            "quota" -> AccountNewsPrivateCopy.FAILURE_QUOTA
            else -> null
        }

    /** The confirmation's three sentences, chosen by the row's own state. */
    fun removeTitle(state: String): String =
        when (toneOf(state)) {
            RemoveTone.LIVE -> AccountNewsPrivateCopy.REMOVE_LIVE_TITLE
            RemoveTone.REFUSED -> AccountNewsPrivateCopy.REMOVE_REFUSED_TITLE
            RemoveTone.PENDING -> AccountNewsPrivateCopy.REMOVE_PENDING_TITLE
        }

    fun removeBody(state: String): String =
        when (toneOf(state)) {
            RemoveTone.LIVE -> AccountNewsPrivateCopy.REMOVE_LIVE_BODY
            RemoveTone.REFUSED -> AccountNewsPrivateCopy.REMOVE_REFUSED_BODY
            RemoveTone.PENDING -> AccountNewsPrivateCopy.REMOVE_PENDING_BODY
        }

    fun removeConfirm(state: String): String =
        when (toneOf(state)) {
            RemoveTone.LIVE, RemoveTone.REFUSED -> AccountNewsPrivateCopy.REMOVE_CONFIRM
            RemoveTone.PENDING -> AccountNewsPrivateCopy.REMOVE_CONFIRM_PENDING
        }

    private enum class RemoveTone {
        LIVE,
        PENDING,
        REFUSED,
    }

    private fun toneOf(state: String): RemoveTone =
        when (state) {
            "live", "broken" -> RemoveTone.LIVE
            "rejected" -> RemoveTone.REFUSED
            else -> RemoveTone.PENDING
        }
}
