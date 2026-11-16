package com.royaraqamia.app.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.account.AccountProfileRepository
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyShape
import com.royaraqamia.app.ui.vectors.LucideVectors

/** The test tags the console's own tests press, named once (#974). */
object AdminConsoleTags {
    const val TITLE = "admin-title"
    const val LIST = "admin-sections"

    fun section(id: String): String = "admin-section-$id"
}

/** One console destination: its words, its glyph and the route it opens. */
private data class AdminSection(
    val id: String,
    val icon: ImageVector,
    val label: String,
    val description: String,
    val route: String,
)

/**
 * The site's `/admin` console index as a screen (#974, ADR-0193).
 *
 * The second client of `app/admin/page.tsx`, not a second design: the same
 * section cards, the same labels and descriptions from
 * `shared/copy/admin-console.json` rather than retyped (ADR-0098), and the same
 * routes. `docs/mobile/parity.json` lists the pair and `npm run check:parity`
 * fails a string that exists on one side only.
 *
 * **Only the rows the review allows cross into Kotlin.** The announcement
 * section is the page's alone: a one-way broadcast to every member is not a
 * control a distributed binary may carry (ADR-0193 decision 3). The rows that
 * are drawn open the page's own routes; the irreversible, money, public-copy and
 * deletion actions stay where the page's confirmation already lives.
 *
 * **Switched off until it is measured.** `docs/mobile/screens.json` carries this
 * screen as `enabled: false` and `docs/mobile/parity-plan.json` keeps the surface
 * `todo`: the document still draws `/admin` until `check:visual` finds the same
 * boxes and the same pixels as the page (ADR-0117, ADR-0118).
 */
@Composable
fun AdminConsoleRoute(
    profileRepository: AccountProfileRepository,
    onDenied: () -> Unit,
    onOpenRoute: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    // The server's answer, asked once: `/api/me` is the only admin read the app
    // makes. A non-admin is turned away before the list is composed, the same
    // redirect the page's layout performs; no allowlist is carried in the APK
    // and no client decision adds authority (ADR-0193 decisions 1 and 4).
    var allowed by remember { mutableStateOf<Boolean?>(null) }

    LaunchedEffect(profileRepository) {
        allowed =
            when (val result = profileRepository.profile()) {
                is ApiResult.Success -> result.value.isAdmin
                is ApiResult.Failure -> false
            }
    }

    when (allowed) {
        null -> Checking()
        false -> LaunchedEffect(Unit) { onDenied() }
        true -> AdminScreen(onOpenRoute = onOpenRoute, modifier = modifier)
    }
}

/** The console index: the title, then one card per section the review allows. */
@Composable
fun AdminScreen(onOpenRoute: (String) -> Unit, modifier: Modifier = Modifier) {
    val spacing = LocalRoySpacing.current
    val scale = LocalRoyTypeScale.current

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = spacing.elementGap, vertical = spacing.elementGapSm),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Text(
            text = AdminConsoleCopy.PAGE_TITLE,
            modifier =
                Modifier.fillMaxWidth()
                    .testTag(AdminConsoleTags.TITLE)
                    .semantics { heading() },
            style = scale.h2,
            color = RoyColors.foreground,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )

        Column(
            modifier = Modifier.fillMaxWidth().testTag(AdminConsoleTags.LIST),
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        ) {
            for (section in sections) {
                SectionCard(section = section, onClick = { onOpenRoute(section.route) })
            }
        }
    }
}

/** The page's section cards, in the page's order; announcement is the one left out. */
private val sections: List<AdminSection> =
    listOf(
        AdminSection(
            id = "certificates",
            icon = LucideVectors.ShieldCheck,
            label = AdminConsoleCopy.CERTIFICATES_LABEL,
            description = AdminConsoleCopy.CERTIFICATES_DESCRIPTION,
            route = "/admin/certificates",
        ),
        AdminSection(
            id = "training",
            icon = LucideVectors.GraduationCap,
            label = AdminConsoleCopy.TRAINING_LABEL,
            description = AdminConsoleCopy.TRAINING_DESCRIPTION,
            route = "/admin/training/cohorts",
        ),
        AdminSection(
            id = "consultations",
            icon = LucideVectors.CalendarCheck2,
            label = AdminConsoleCopy.CONSULTATIONS_LABEL,
            description = AdminConsoleCopy.CONSULTATIONS_DESCRIPTION,
            route = "/admin/consultations/bookings",
        ),
        AdminSection(
            id = "clients",
            icon = LucideVectors.Briefcase,
            label = AdminConsoleCopy.CLIENTS_LABEL,
            description = AdminConsoleCopy.CLIENTS_DESCRIPTION,
            route = "/admin/clients/project-requests",
        ),
        AdminSection(
            id = "linksnap",
            icon = LucideVectors.Link2,
            label = AdminConsoleCopy.LINKSNAP_LABEL,
            description = AdminConsoleCopy.LINKSNAP_DESCRIPTION,
            route = "/admin/linksnap",
        ),
        AdminSection(
            id = "plans",
            icon = LucideVectors.Wallet,
            label = AdminConsoleCopy.PLANS_LABEL,
            description = AdminConsoleCopy.PLANS_DESCRIPTION,
            route = "/admin/plans",
        ),
        AdminSection(
            id = "news",
            icon = LucideVectors.Newspaper,
            label = AdminConsoleCopy.NEWS_LABEL,
            description = AdminConsoleCopy.NEWS_DESCRIPTION,
            route = "/admin/news",
        ),
        AdminSection(
            id = "marketplace",
            icon = LucideVectors.Store,
            label = AdminConsoleCopy.MARKETPLACE_LABEL,
            description = AdminConsoleCopy.MARKETPLACE_DESCRIPTION,
            route = "/admin/mcp/marketplace",
        ),
        AdminSection(
            id = "reports",
            icon = LucideVectors.Flag,
            label = AdminConsoleCopy.REPORTS_LABEL,
            description = AdminConsoleCopy.REPORTS_DESCRIPTION,
            route = "/admin/reports",
        ),
    )

/** One card: the section's glyph, its label and its sentence, and the way in. */
@Composable
private fun SectionCard(section: AdminSection, onClick: () -> Unit) {
    val spacing = LocalRoySpacing.current
    val scale = LocalRoyTypeScale.current

    Surface(
        modifier =
            Modifier.fillMaxWidth()
                .testTag(AdminConsoleTags.section(section.id))
                .clip(RoyShape.card)
                .clickable(role = Role.Button, onClick = onClick),
        shape = Recipes.Card.radius,
        color = Recipes.Card.container,
        border = Recipes.Card.border,
    ) {
        Row(
            modifier =
                Modifier.fillMaxWidth()
                    .padding(horizontal = spacing.elementGap, vertical = spacing.elementGapSm),
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier =
                    Modifier.size(40.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(RoyColors.muted)
                        .border(1.dp, RoyColors.border, RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = section.icon,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                    tint = RoyColors.primary,
                )
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            ) {
                Text(
                    text = section.label,
                    style = scale.body,
                    color = RoyColors.foreground,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = section.description,
                    style = scale.small,
                    color = RoyColors.mutedForeground,
                )
            }

            Icon(
                imageVector = LucideVectors.ArrowLeft,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = RoyColors.mutedForeground,
            )
        }
    }
}

/** The server has not answered yet; the page's layout would still be resolving too. */
@Composable
private fun Checking() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = RoyColors.primary)
    }
}
