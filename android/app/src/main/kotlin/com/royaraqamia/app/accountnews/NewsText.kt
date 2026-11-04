package com.royaraqamia.app.accountnews

/**
 * The account news screen's words, in the page's order (#950, ADR-0098).
 *
 * Every sentence is a generated copy constant; this object only decides which
 * one a value goes into. The internal category, region and status keys are the
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

    fun personalBody(min: Int, cost: Int): String =
        AccountNewsPreferencesCopy.PERSONAL_BODY
            .replace("{min}", min.toString())
            .replace("{cost}", cost.toString())

    fun privateStatusLabel(status: String): String =
        if (status == "broken") {
            AccountNewsPrivateCopy.STATUS_BROKEN
        } else {
            AccountNewsPrivateCopy.STATUS_READY
        }

    fun removeLabel(name: String): String =
        AccountNewsPrivateCopy.REMOVE_ARIA.replace("{name}", name)

    fun requestStatusLabel(status: String): String =
        when (status) {
            "resolving" -> AccountNewsRequestCopy.STATUS_RESOLVING
            "ready" -> AccountNewsRequestCopy.STATUS_READY
            "needs_review" -> AccountNewsRequestCopy.STATUS_NEEDS_REVIEW
            "approved" -> AccountNewsRequestCopy.STATUS_APPROVED
            "rejected" -> AccountNewsRequestCopy.STATUS_REJECTED
            else -> status
        }

    fun failureLabel(failure: String?): String? =
        when (failure) {
            "unsupported" -> AccountNewsRequestCopy.FAILURE_UNSUPPORTED
            "no_feed" -> AccountNewsRequestCopy.FAILURE_NO_FEED
            "unreachable" -> AccountNewsRequestCopy.FAILURE_UNREACHABLE
            "quota" -> AccountNewsRequestCopy.FAILURE_QUOTA
            else -> null
        }
}
