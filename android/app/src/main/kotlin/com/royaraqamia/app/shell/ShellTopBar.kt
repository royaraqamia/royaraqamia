package com.royaraqamia.app.shell

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.R
import com.royaraqamia.app.theme.LocalRoySpacing

/** The site's bar is `h-16` (`lg:h-20`); the app has no separate large step. */
private val TopBarHeight = 64.dp

/** The site draws the wordmark at `h-8 w-8`. */
private val MarkSize = 32.dp

/**
 * The top bar (#647): the brand mark at the inline start and `خدماتنا` centred.
 *
 * The mark is the launcher artwork the APK already bundles, drawn as the site
 * draws it — a 32 dp disc — so the frame's first row is the product's rather than
 * the platform's. It is decorative here and carries no description: the tab bar's
 * home slot is the accessible way home, and a second control for the same
 * destination is a second announcement.
 *
 * The notification bell the site shows at the inline end is not in this slice: its
 * unread count comes from a fetch, and a bell that cannot say how many are unread
 * is a control that lies. It lands with the notifications surface (#659).
 */
@Composable
fun ShellTopBar(onOpenServices: () -> Unit, modifier: Modifier = Modifier) {
    val spacing = LocalRoySpacing.current

    Row(
        modifier =
            modifier.fillMaxWidth()
                .statusBarsPadding()
                .height(TopBarHeight)
                .padding(horizontal = spacing.containerPadding),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            painter = painterResource(R.mipmap.ic_launcher_foreground),
            contentDescription = null,
            modifier = Modifier.size(MarkSize).clip(RoundedCornerShape(percent = 50)),
        )
        Spacer(Modifier.weight(1f))
        ServicesTrigger(onOpen = onOpenServices)
        Spacer(Modifier.weight(1f))
        // Balances the mark so the pill stays centred in the bar, as it is on the
        // site (the trigger is absolutely centred there).
        Spacer(Modifier.width(MarkSize))
    }
}
