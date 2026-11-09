package com.royaraqamia.app.account

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/** The test tags the screen's own tests press, named once (#948). */
object AccountTags {
    const val SIGN_OUT = "account-sign-out"
    const val SIGN_OUT_CONFIRM = "account-sign-out-confirm"

    fun row(id: String): String = "account-row-$id"
}

/** One destination on the account page: its words, its glyph and the route it opens. */
private data class AccountLink(
    val id: String,
    val icon: ImageVector,
    val label: String,
    val route: String,
)

/**
 * The account area's rows and its sign-out (#948).
 *
 * The second client of `frontend/ui/account/account-rows.tsx`, not a
 * reinterpretation of it: the same destinations in the same order, the same
 * public links, the same destructive sign-out and the same question before it,
 * with the words generated from `shared/copy/account-rows.json` rather than
 * retyped (ADR-0098). `docs/mobile/parity.json` lists the pair, and
 * `npm run check:parity` fails a state or a string that exists on one side only.
 *
 * A destination is a route, not a screen: the shell hands it to the document
 * while its surface is still the web's, and the shell's own `NativeSurfaces`
 * decides when a route is drawn natively instead. The screen therefore never
 * learns a URL or a product.
 */
@Composable
fun AccountRows(
    state: AccountUiState,
    isAdmin: Boolean,
    onOpenRoute: (String) -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var confirmingSignOut by remember { mutableStateOf(false) }

    Column(
        modifier =
            modifier.fillMaxWidth().semantics {
                // The site's `aria-label` on the same list, so a screen reader
                // announces the group before its rows.
                contentDescription = AccountRowsCopy.NAV_LABEL
            },
        verticalArrangement = Arrangement.spacedBy(LocalRoySpacing.current.elementGapSm),
    ) {
        for (link in links(isAdmin)) {
            AccountRow(link = link, onClick = { onOpenRoute(link.route) })
        }

        if (state is AccountUiState.Member) {
            SignOutRow(onClick = { confirmingSignOut = true })
        }
    }

    if (confirmingSignOut) {
        ConfirmSignOut(
            onDismiss = { confirmingSignOut = false },
            onConfirm = {
                confirmingSignOut = false
                onSignOut()
            },
        )
    }
}

/** The page's rows, in the page's order; the admin row is the one conditional. */
private fun links(isAdmin: Boolean): List<AccountLink> =
    buildList {
        add(
            AccountLink(
                id = "submissions",
                icon = LucideVectors.ClipboardList,
                label = AccountRowsCopy.SUBMISSIONS,
                route = "/account/submissions",
            )
        )
        add(
            AccountLink(
                id = "posts",
                icon = LucideVectors.FileText,
                label = AccountRowsCopy.POSTS,
                route = "/account/posts",
            )
        )
        add(
            AccountLink(
                id = "news",
                icon = LucideVectors.Newspaper,
                label = AccountRowsCopy.NEWS,
                route = "/account/news",
            )
        )
        add(
            AccountLink(
                id = "links",
                icon = LucideVectors.Link2,
                label = AccountRowsCopy.LINKS,
                route = "/account/links",
            )
        )
        add(
            AccountLink(
                id = "connected-apps",
                icon = LucideVectors.Plug,
                label = AccountRowsCopy.CONNECTED_APPS,
                route = "/account/connected-apps",
            )
        )
        add(
            AccountLink(
                id = "services",
                icon = LucideVectors.EyeOff,
                label = AccountRowsCopy.SERVICES,
                route = "/account/services",
            )
        )
        add(
            AccountLink(
                id = "blocked",
                icon = LucideVectors.ShieldOff,
                label = AccountRowsCopy.BLOCKED,
                route = "/account/blocked",
            )
        )
        add(
            AccountLink(
                id = "pricing",
                icon = LucideVectors.Sparkles,
                label = AccountRowsCopy.PRICING,
                route = "/pricing",
            )
        )
        if (isAdmin) {
            add(
                AccountLink(
                    id = "admin",
                    icon = LucideVectors.ShieldCheck,
                    label = AccountRowsCopy.ADMIN,
                    route = "/admin",
                )
            )
        }
        add(
            AccountLink(
                id = "faq",
                icon = LucideVectors.CircleQuestionMark,
                label = AccountRowsCopy.FAQ,
                route = "/account/faq",
            )
        )
        add(
            AccountLink(
                id = "contact",
                // The site's support is a chat with its own account, not WhatsApp
                // (`SUPPORT_USERNAME` in `frontend/shared/constants.ts`).
                icon = LucideVectors.MessageCircle,
                label = AccountRowsCopy.CONTACT,
                route = "/chats/new?to=$SUPPORT_USERNAME",
            )
        )
    }

/** One row: a glyph, its label, and the site's arrow at the row's end. */
@Composable
private fun AccountRow(link: AccountLink, onClick: () -> Unit) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().testTag(AccountTags.row(link.id)),
        shape = Recipes.Card.radius,
        color = Recipes.Card.container,
        border = Recipes.Card.border,
    ) {
        Row(
            modifier =
                Modifier.fillMaxWidth()
                    .padding(horizontal = spacing.elementGap, vertical = spacing.elementGap),
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = link.icon,
                contentDescription = null,
                tint = RoyColors.primary,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
            Text(
                text = link.label,
                modifier = Modifier.weight(1f),
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
            )
            Text(text = "←", style = type.small, color = RoyColors.primary.copy(alpha = 0.7f))
        }
    }
}

/** The member's sign-out: the same row, in the site's destructive tint. */
@Composable
private fun SignOutRow(onClick: () -> Unit) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val tint = RoyColors.destructive

    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().testTag(AccountTags.SIGN_OUT),
        shape = Recipes.Card.radius,
        color = Recipes.Card.container,
        border = BorderStroke(Recipes.Card.border.width, tint.copy(alpha = 0.3f)),
    ) {
        Row(
            modifier =
                Modifier.fillMaxWidth()
                    .padding(horizontal = spacing.elementGap, vertical = spacing.elementGap),
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = LucideVectors.LogOut,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
            Text(
                text = AccountRowsCopy.SIGN_OUT,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = tint.copy(alpha = 0.9f),
            )
        }
    }
}

/** The page's question before a sign-out, and its quiet way out. */
@Composable
private fun ConfirmSignOut(onDismiss: () -> Unit, onConfirm: () -> Unit) {
    val type = LocalRoyTypeScale.current

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = AccountRowsCopy.SIGN_OUT,
                style = type.small.copy(fontWeight = FontWeight.Bold),
            )
        },
        text = { Text(text = AccountRowsCopy.SIGN_OUT_MESSAGE, style = type.small) },
        confirmButton = {
            TextButton(onClick = onConfirm, modifier = Modifier.testTag(AccountTags.SIGN_OUT_CONFIRM)) {
                Text(text = AccountRowsCopy.SIGN_OUT, color = RoyColors.destructive)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(AccountRowsCopy.CANCEL) }
        },
    )
}

/** The site's support handle, which its own constants file spells once. */
private const val SUPPORT_USERNAME = "royaraqamia"
