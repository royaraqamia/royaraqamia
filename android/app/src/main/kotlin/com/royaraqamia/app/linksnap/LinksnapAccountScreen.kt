package com.royaraqamia.app.linksnap

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.royaraqamia.app.store.linksnap.LinksnapRepository

/**
 * The account area's owned links (#654), which is LinkSnap's dashboard on the
 * site (`app/account/links/page.tsx`).
 *
 * One screen, two routes: the list, the shortener and every owned write are the
 * same controls the product page draws, so this is a thin entry point rather
 * than a second interpretation. The analytics panel is server-only and stays the
 * document.
 */
@Composable
fun LinksnapAccountScreen(
    repository: LinksnapRepository,
    siteUrl: String,
    signedIn: Boolean,
    modifier: Modifier = Modifier,
    onCopy: (String) -> Unit = {},
    onSignIn: () -> Unit = {},
) {
    LinksnapScreen(
        repository = repository,
        siteUrl = siteUrl,
        signedIn = signedIn,
        modifier = modifier,
        onCopy = onCopy,
        onSignIn = onSignIn,
    )
}
