package com.royaraqamia.app.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.account.AccountProfileRepository
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyFonts
import com.royaraqamia.app.ui.vectors.LucideVectors

/** The test tags the console's own tests press, named once (#974). */
object AdminConsoleTags {
    const val TITLE = AdminMetrics.TITLE
    const val LIST = AdminMetrics.LIST

    fun section(id: String): String = AdminMetrics.section(id)
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
 * **Measured before it was switched on.** The screen draws from [AdminMetrics],
 * the boxes `shared/visual/admin.json` records on the page at the app's viewport,
 * and `docs/mobile/visual-gate.json` carries the pair's baseline (#1627,
 * ADR-0117, ADR-0118).
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
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .background(RoyColors.background)
                .verticalScroll(rememberScrollState())
                .padding(
                    horizontal = AdminMetrics.screenPaddingX,
                    vertical = AdminMetrics.screenPaddingY,
                ),
    ) {
        Box(
            modifier =
                Modifier.fillMaxWidth()
                    .height(AdminMetrics.titleHeight)
                    .testTag(AdminConsoleTags.TITLE),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = AdminConsoleCopy.PAGE_TITLE,
                modifier = Modifier.semantics { heading() },
                style =
                    TextStyle(
                        fontFamily = RoyFonts.ui,
                        fontSize = AdminMetrics.titleSize,
                        lineHeight = AdminMetrics.titleLineHeight,
                        fontWeight = AdminMetrics.titleWeight,
                    ),
                color = RoyColors.foreground,
                textAlign = TextAlign.Center,
            )
        }

        Spacer(Modifier.height(AdminMetrics.titleToList))

        Column(
            modifier = Modifier.fillMaxWidth().testTag(AdminConsoleTags.LIST),
            verticalArrangement = Arrangement.spacedBy(AdminMetrics.listGap),
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
        AdminSection(
            id = "skills",
            icon = LucideVectors.Sparkles,
            label = AdminConsoleCopy.SKILLS_LABEL,
            description = AdminConsoleCopy.SKILLS_DESCRIPTION,
            route = "/admin/agent/skills",
        ),
    )

/** One card: the section's glyph, its label and its sentence, and the way in. */
@Composable
private fun SectionCard(section: AdminSection, onClick: () -> Unit) {
    Surface(
        modifier =
            Modifier.fillMaxWidth()
                .testTag(AdminConsoleTags.section(section.id))
                .clip(RoundedCornerShape(AdminMetrics.cardRadius))
                .clickable(role = Role.Button, onClick = onClick),
        shape = RoundedCornerShape(AdminMetrics.cardRadius),
        color = Recipes.Card.container,
        border = Recipes.Card.border,
    ) {
        Row(
            modifier =
                Modifier.fillMaxWidth()
                    .padding(
                        horizontal = AdminMetrics.cardPaddingX,
                        vertical = AdminMetrics.cardPaddingY,
                    ),
            horizontalArrangement = Arrangement.spacedBy(AdminMetrics.cardGap),
            verticalAlignment = Alignment.Top,
        ) {
            Box(
                modifier =
                    Modifier.size(AdminMetrics.iconBox)
                        .clip(RoundedCornerShape(AdminMetrics.iconRadius))
                        .background(RoyColors.muted)
                        .border(
                            AdminMetrics.cardBorder,
                            RoyColors.border,
                            RoundedCornerShape(AdminMetrics.iconRadius),
                        ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = section.icon,
                    contentDescription = null,
                    modifier = Modifier.size(AdminMetrics.iconSize),
                    tint = RoyColors.primary,
                )
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(AdminMetrics.labelBodyGap),
            ) {
                Text(
                    text = section.label,
                    style =
                        TextStyle(
                            fontFamily = RoyFonts.ui,
                            fontSize = AdminMetrics.labelSize,
                            lineHeight = AdminMetrics.labelLineHeight,
                            fontWeight = AdminMetrics.labelWeight,
                        ),
                    color = RoyColors.foreground,
                )
                Text(
                    text = section.description,
                    style =
                        TextStyle(
                            fontFamily = RoyFonts.ui,
                            fontSize = AdminMetrics.descriptionSize,
                            lineHeight = AdminMetrics.descriptionLineHeight,
                            fontWeight = FontWeight.Normal,
                        ),
                    color = RoyColors.mutedForeground,
                )
            }

            Icon(
                imageVector = LucideVectors.ArrowLeft,
                contentDescription = null,
                modifier = Modifier.size(AdminMetrics.arrowSize).padding(top = 1.dp),
                tint = RoyColors.mutedForeground,
            )
        }
    }
}

/** The server has not answered yet; the page's layout would still be resolving too. */
@Composable
private fun Checking() {
    Box(
        modifier = Modifier.fillMaxSize().background(RoyColors.background),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(color = RoyColors.primary)
    }
}
