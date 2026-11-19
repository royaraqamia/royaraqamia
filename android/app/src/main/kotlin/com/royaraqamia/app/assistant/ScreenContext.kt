package com.royaraqamia.app.assistant

import com.royaraqamia.app.account.AccountFaqCopy
import com.royaraqamia.app.account.BlockedMembersCopy
import com.royaraqamia.app.accountnews.AccountNewsPreferencesCopy
import com.royaraqamia.app.athkar.AthkarPageCopy
import com.royaraqamia.app.connectedapps.ConnectedAppsCopy
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.ScreenContextSnapshot
import com.royaraqamia.app.habitflow.HabitflowCopy
import com.royaraqamia.app.linksnap.LinksnapPageCopy
import com.royaraqamia.app.news.NewsPageCopy
import com.royaraqamia.app.plans.PlanCardCopy
import com.royaraqamia.app.rates.RatesPageCopy
import com.royaraqamia.app.shell.Routes
import com.royaraqamia.app.shell.ServicesCopy
import com.royaraqamia.app.shell.Screens
import com.royaraqamia.app.verify.VerifyCopy
import java.time.Instant
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * What the app tells the assistant about the screen in front of the member
 * (ADR-0181, decision 6).
 *
 * The site publishes a structured snapshot of the page's own state and attaches
 * it to the turn, so "what is wrong with this form" is answerable without asking
 * which form. This is the app's half of that contract: the same ids, the same
 * fields, the same request field. The type is generated from the server's own
 * schema (`ScreenContextSnapshotSchema`), so a snapshot the app writes cannot
 * name a field the site's block does not read.
 *
 * What the app does **not** send is as deliberate as what it does. There is no
 * overlay registry and no field allowlist on this side yet, so `overlays`,
 * `focus`, `fields` and `text` are empty: the app names the screen and nothing
 * about its content. A surface that grows a readable field adds it here, and
 * that change is the one `security-review` is mandatory on (ADR-0181).
 */
sealed interface ScreenContextInput {
    /** The body this input adds to a turn, or an object the server refuses. */
    fun toJsonObject(): JsonObject

    /**
     * "I cannot show this screen."
     *
     * An admin route is not an observed surface (decision 8): no route, no
     * fields, no text. Saying so lets the turn ask instead of guessing, which is
     * the only recovering answer when the page may carry another member's row.
     */
    data object Blind : ScreenContextInput {
        override fun toJsonObject(): JsonObject = buildJsonObject { put("blind", true) }
    }

    /** The screen's own state, named the way the site names it. */
    data class Shown(val snapshot: ScreenContextSnapshot) : ScreenContextInput {
        // The explicit encoder: the schema requires `focus` and `tab` to be
        // present, nullable, so omitting a null would be a body the server
        // refuses rather than a shorter one.
        override fun toJsonObject(): JsonObject =
            ContractCodec.objectOf(snapshot, ScreenContextSnapshot.serializer())
    }
}

/**
 * The route the shell is on, as the next turn reads it (ADR-0181, decision 6).
 *
 * The site's provider is mounted once and publishes on settle; the app has no
 * page to settle, so the shell says where it is on every navigation and the turn
 * asks at the moment it sends - the same read-at-send the web composer makes, so
 * a message typed before a navigation still describes the screen it was asked
 * from.
 *
 * Nothing here is persisted, logged or stored: it is the route string the shell
 * already holds, composed into a body that leaves with the request.
 */
object PublishedScreen {
    private var route: String? = null

    /** Called by the shell on every navigation, and nowhere else. */
    fun follow(route: String) {
        this.route = route
    }

    /** A sign-out is a fresh start: the next member's first turn is not this one's screen. */
    fun clear() {
        route = null
    }

    /**
     * What the next turn carries, or null when the shell is nowhere yet.
     *
     * A route the matrix does not carry still publishes: the site shows a route
     * it cannot name rather than pretending not to see it (decision 2), and the
     * app's own extra routes - a drill-down that is not a surface - are read the
     * same way, by path and product, with an empty `screenId`.
     */
    fun current(now: Instant = Instant.now()): ScreenContextInput? {
        val here = route ?: return null
        val resolved = Screens.resolve(here)
        if (resolved != null && resolved.screenId in BLIND_SURFACES) {
            return ScreenContextInput.Blind
        }
        return ScreenContextInput.Shown(
            ScreenContextSnapshot(
                route = here,
                product = resolved?.product ?: productOf(here),
                screenId = resolved?.screenId ?: "",
                title = ScreenTitles.of(here),
                overlays = emptyList(),
                focus = null,
                tab = resolved?.tab,
                fields = emptyMap(),
                text = "",
                updatedAt = now.toString(),
            )
        )
    }

    /**
     * Surfaces that publish nothing at all (ADR-0181, decision 8). The site keeps
     * the same list in `shared/contracts/screens.ts`; the app keeps it here
     * because it is the only place the app can ask the question.
     */
    private val BLIND_SURFACES = setOf("admin")

    /** A path the matrix does not carry still has a first segment to name it by. */
    private fun productOf(route: String): String =
        route.split('/').firstOrNull { it.isNotEmpty() } ?: "site"
}

/**
 * The title a screen draws, by the route the shell is on (ADR-0181).
 *
 * The site's title is `document.title` - the page's own metadata, rendered by
 * the browser. The app has no document title, and the equivalent is the constant
 * the screen paints as its heading, so this map *reads* the generated copy
 * instead of retyping the words: a copy change is a change here, and a key that
 * leaves the copy file stops compiling.
 *
 * A route whose screen draws no single heading is written down as untitled with
 * the reason, rather than left out. A new port then has to answer the question -
 * a title, or why the assistant is told none - instead of publishing a blank
 * nobody decided on.
 */
object ScreenTitles {
    private val titled: Map<String, String> =
        mapOf(
            "/verify" to VerifyCopy.PAGE_TITLE,
            "/account/faq" to AccountFaqCopy.PAGE_TITLE,
            "/account/plan" to PlanCardCopy.PAGE_TITLE,
            "/account/connected-apps" to ConnectedAppsCopy.PAGE_TITLE,
            "/account/blocked" to BlockedMembersCopy.PAGE_TITLE,
            "/account/news" to AccountNewsPreferencesCopy.PAGE_TITLE,
            "/linksnap" to LinksnapPageCopy.PAGE_TITLE,
            "/rates" to RatesPageCopy.PAGE_TITLE,
            "/habitflow" to HabitflowCopy.LIST_TITLE,
            "/news" to NewsPageCopy.PAGE_TITLE,
            "/notes" to ServicesCopy.NOTES,
            "/athkar" to AthkarPageCopy.PAGE_TITLE,
            "/athkar/evening" to AthkarPageCopy.PAGE_TITLE,
        )

    /** The routes whose screen draws no heading, and why that is the decision. */
    val untitled: Map<String, String> =
        mapOf(
            "/account/links" to "the links list is a section of the account page; its heading is the document's",
            "/spendtrack" to "the expenses screen opens on the month's total, not on a title",

            "/community" to "the feed draws rows; the page's heading is the document's",
            "/scan" to "the scanner's heading is its camera state line, which is not a screen title",
            "/notifications" to "the bell screen opens on its tabs",
        )

    /** A code route keeps its section's title: `/verify/<code>` is still the certificate page. */
    private val byPrefix: List<Pair<String, String>> =
        listOf("/verify/" to VerifyCopy.PAGE_TITLE)

    /** The title to publish, or the empty string when the screen has none. */
    fun of(route: String): String {
        val path = Routes.normalize(route)
        titled[path]?.let {
            return it
        }
        return byPrefix.firstOrNull { (prefix, _) -> path.startsWith(prefix) }?.second ?: ""
    }
}
