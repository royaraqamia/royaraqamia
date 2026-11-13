package com.royaraqamia.app.mcp

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.account.AvatarLoader
import com.royaraqamia.app.connectedapps.ConnectedAppsRepository
import com.royaraqamia.app.shell.AppsHost
import com.royaraqamia.app.shell.AppsSheetTab
import com.royaraqamia.app.shell.AppsSurface
import com.royaraqamia.app.shell.ServicesSheetCopy
import com.royaraqamia.app.theme.RoyColors

/**
 * The apps surface at its own address (#1256, ADR-0159).
 *
 * The sheet is the door a member opens; `/mcp/apps` is the address a sheet cannot
 * carry — the OAuth callback's landing, a bookmark, a deep link from the app, and
 * the back button. The page draws the same component (`marketplace-view.tsx` and
 * `apps-surface.tsx` with `host="page"`), so this screen is only the page host:
 * the title, the page's margins, and the surface itself.
 *
 * The tab is the route, as it is on the site: `/mcp/apps` is the store, `?tab=`
 * names the other two, and [onTabChange] navigates rather than setting state, so
 * a tab is shareable and the back button walks it. The search term belongs to the
 * active tab and starts empty on each one, exactly as the page resets it.
 */
@Composable
fun McpAppsScreen(
    tab: AppsSheetTab,
    order: List<String>,
    busy: String?,
    error: String?,
    onToggle: (String) -> Unit,
    marketplace: McpStoreRepository?,
    signedIn: Boolean,
    onSignIn: () -> Unit,
    onOpenConnection: (String) -> Unit,
    onOpenExternal: (String) -> Unit,
    brandMark: AvatarLoader?,
    connectedApps: ConnectedAppsRepository?,
    onConnectNew: () -> Unit,
    onTabChange: (AppsSheetTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    var query by remember(tab) { mutableStateOf("") }

    Column(
        modifier
            .fillMaxSize()
            .background(RoyColors.background)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = AppsPageMetrics.inset, vertical = AppsPageMetrics.top)
    ) {
        Text(
            text = ServicesSheetCopy.TITLE,
            modifier =
                Modifier.fillMaxWidth()
                    .height(AppsPageMetrics.titleHeight)
                    .testTag(AppsPageMetrics.TITLE)
                    .semantics { heading() },
            style =
                TextStyle(
                    fontSize = AppsPageMetrics.titleSize,
                    lineHeight = AppsPageMetrics.titleLineHeight,
                    fontWeight = AppsPageMetrics.titleWeight,
                    letterSpacing = AppsPageMetrics.titleTracking,
                    textAlign = TextAlign.Center,
                    brush =
                        Brush.horizontalGradient(
                            listOf(
                                AppsPageMetrics.titleStart,
                                AppsPageMetrics.titleMiddle,
                                AppsPageMetrics.titleEnd,
                            )
                        ),
                ),
        )

        Spacer(Modifier.height(AppsPageMetrics.titleGap))

        AppsSurface(
            host = AppsHost.Page,
            tab = tab,
            onTabChange = onTabChange,
            query = query,
            onQueryChange = { query = it },
            order = order,
            busy = busy,
            error = error,
            onToggle = onToggle,
            marketplace = marketplace,
            signedIn = signedIn,
            onSignIn = onSignIn,
            onOpenConnection = onOpenConnection,
            onOpenExternal = onOpenExternal,
            brandMark = brandMark,
            connectedApps = connectedApps,
            onConnectNew = onConnectNew,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/**
 * The page's own numbers, read from `marketplace-view.tsx` and `SectionTitle`
 * (ADR-0118).
 *
 * The page is `mx-auto max-w-3xl px-4` under a `pt-6` main, its header is
 * `mb-6`, and its title is `SectionTitle`'s `max-sm:text-3xl/[1.25]
 * font-extrabold tracking-tight` with the highlight's `py-[0.15em]`.
 */
internal object AppsPageMetrics {
    const val TITLE = "apps-page-title"

    val inset = 16.dp
    val top = 24.dp
    val titleGap = 24.dp

    val titleSize = 30.sp
    val titleLineHeight = 37.5.sp
    val titleHeight = 46.5.dp
    val titleWeight = FontWeight.ExtraBold
    val titleTracking = (-0.025).em

    val titleStart = Color(0xFFA684FF)
    val titleMiddle = Color(0xFFED6AFF)
    val titleEnd = Color(0xFF7C86FF)
}
