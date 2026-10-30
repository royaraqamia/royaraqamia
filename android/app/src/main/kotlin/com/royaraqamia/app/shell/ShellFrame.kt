package com.royaraqamia.app.shell

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * The frame the app draws before it is anything else (#647).
 *
 * A surface, the destination's content, and the tab bar. It is drawn from the
 * tokens (`RoyaraqamiaTheme` is installed by [ShellActivity]) and it is RTL before
 * it is laid out, so the first frame is the product's rather than the platform's.
 *
 * While a destination's screen is still the document ([NativeSurfaces]), the
 * content area is empty and the shell hands the route over: the frame is what the
 * splash lifts into, and what the user comes back to when the document closes.
 * Each ported surface fills the content area and its row in
 * `docs/mobile/screens.json` changes in the same pull request.
 */
@Composable
fun ShellFrame(
    currentRoute: String,
    onSelect: (ShellTab) -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit = {},
) {
    Surface(modifier = modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize()) {
            Box(
                Modifier.weight(1f)
                    .fillMaxWidth()
                    .statusBarsPadding(),
                content = content,
            )
            ShellTabBar(currentRoute = currentRoute, onSelect = onSelect)
        }
    }
}
