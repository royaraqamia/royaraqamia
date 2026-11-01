package com.royaraqamia.app.shell

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier

/**
 * The frame the app draws before it is anything else (#647).
 *
 * A surface, the top bar, the destination's content, and the tab bar. It is drawn
 * from the tokens (`RoyaraqamiaTheme` is installed by [ShellActivity]) and it is
 * RTL before it is laid out, so the first frame is the product's rather than the
 * platform's.
 *
 * While a destination's screen is still the document ([NativeSurfaces]), the
 * content area is empty and the shell hands the route over: the frame is what the
 * splash lifts into, and what the user comes back to when the document closes.
 * Each ported surface fills the content area and its row in
 * `docs/mobile/screens.json` changes in the same pull request.
 *
 * The services sheet is opened from the frame and closes itself before it
 * navigates, so the sheet never outlives the route it chose.
 */
@Composable
fun ShellFrame(
    currentRoute: String,
    onSelect: (ShellTab) -> Unit,
    onOpenRoute: (String) -> Unit,
    modifier: Modifier = Modifier,
    /** The routes this member hid; the sheet draws the rest (ADR-0112). */
    hiddenRoutes: Set<String> = emptySet(),
    /** Where the sheet keeps this device's order (#806). */
    servicesOrder: ServicesOrderStore? = null,
    content: @Composable BoxScope.() -> Unit = {},
) {
    var servicesOpen by remember { mutableStateOf(false) }

    Surface(modifier = modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize()) {
            ShellTopBar(
                onOpenServices = { servicesOpen = true },
                showServices = ServicesEntry.visibleRows(hiddenRoutes).isNotEmpty(),
            )
            Box(Modifier.weight(1f).fillMaxWidth(), content = content)
            ShellTabBar(currentRoute = currentRoute, onSelect = onSelect)
        }
        ServicesSheet(
            open = servicesOpen,
            hiddenRoutes = hiddenRoutes,
            order = servicesOrder,
            onDismiss = { servicesOpen = false },
            onSelect = { route ->
                servicesOpen = false
                onOpenRoute(route)
            },
        )
    }
}
