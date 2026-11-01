package com.royaraqamia.app.shell

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.R
import com.royaraqamia.app.notifications.NotificationsRepository
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/** The site's bar is `h-16` (`lg:h-20`); the app has no separate large step. */
private val TopBarHeight = 64.dp

/** The site draws the wordmark at `h-8 w-8`. */
private val MarkSize = 32.dp

/** The site's bell is `h-10 w-10`. */
private val BellSize = 40.dp

/**
 * The top bar (#647): the brand mark at the inline start, `خدماتنا` centred and the
 * notification bell at the inline end (#659).
 *
 * The mark is the launcher artwork the APK already bundles, drawn as the site
 * draws it — a 32 dp disc — so the frame's first row is the product's rather than
 * the platform's. It is decorative here and carries no description: the tab bar's
 * home slot is the accessible way home, and a second control for the same
 * destination is a second announcement.
 *
 * The bar is a [Box] rather than a row of weighted spacers because the site's
 * trigger is absolutely centred: a mark on one end and a bell on the other are
 * different widths, so two weights would drift the pill off centre by four dp.
 *
 * The bell is only drawn when there is a number to stand behind ([unreadCount]
 * non-null, which the caller ties to the session). Its words are the site's own
 * (`shared/copy/notification-bell.json`): the plain name when nothing is unread,
 * and the name with the count when something is, exactly as the site announces
 * it. A bell that cannot say how many are unread is a control that lies.
 */
@Composable
fun ShellTopBar(
    onOpenServices: () -> Unit,
    modifier: Modifier = Modifier,
    /** False when every row is hidden: a trigger that opens nothing is worse than none. */
    showServices: Boolean = true,
    /** The unread count, or null when there is no session to ask for one. */
    unreadCount: Int? = null,
    onOpenNotifications: () -> Unit = {},
) {
    val spacing = LocalRoySpacing.current

    Box(
        modifier =
            modifier.fillMaxWidth()
                .statusBarsPadding()
                .height(TopBarHeight)
                .padding(horizontal = spacing.containerPadding),
    ) {
        Image(
            painter = painterResource(R.mipmap.ic_launcher_foreground),
            contentDescription = null,
            modifier =
                Modifier.align(Alignment.CenterStart)
                    .size(MarkSize)
                    .clip(RoundedCornerShape(percent = 50)),
        )
        if (showServices) {
            ServicesTrigger(onOpen = onOpenServices, modifier = Modifier.align(Alignment.Center))
        }
        if (unreadCount != null) {
            NotificationBell(
                unreadCount = unreadCount,
                onOpen = onOpenNotifications,
                modifier = Modifier.align(Alignment.CenterEnd),
            )
        }
    }
}

/**
 * The site's notification control: a link to the notification centre with its
 * unread count, never a panel.
 *
 * The count is capped at [NotificationsRepository.MAX_BADGE] with the site's
 * `99+`, and drawn in the digit face (`RoyTypeScale.digits`) like every other
 * read-only number in the app: the badge is a number, not a sentence.
 *
 * One accessible node: the bell glyph is decorative, and the count is part of the
 * name rather than a second announcement.
 */
@Composable
internal fun NotificationBell(
    unreadCount: Int,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val type = LocalRoyTypeScale.current
    val badge = Recipes.Badge.sm(type)
    val description = notificationBellDescription(unreadCount)

    Box(
        modifier =
            modifier.size(BellSize)
                .clip(CircleShape)
                .border(1.dp, RoyColors.border.copy(alpha = 0.6f), CircleShape)
                .background(RoyColors.background.copy(alpha = 0.8f))
                .clickable(onClick = onOpen)
                .semantics {
                    role = Role.Button
                    contentDescription = description
                },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = LucideVectors.Bell,
            contentDescription = null,
            tint = RoyColors.foreground,
            modifier = Modifier.size(20.dp),
        )
        if (unreadCount > 0) {
            Text(
                text = notificationBadgeLabel(unreadCount),
                style = type.digits(badge.text),
                color = RoyColors.destructiveForeground,
                maxLines = 1,
                modifier =
                    Modifier.align(Alignment.TopEnd)
                        .offset(x = 4.dp, y = (-2).dp)
                        .defaultMinSize(minWidth = 18.dp, minHeight = 18.dp)
                        .background(RoyColors.destructive, CircleShape)
                        .padding(horizontal = 4.dp, vertical = 1.dp)
                        .clearAndSetSemantics { },
            )
        }
    }
}

/**
 * What the control is called: the site's plain name, or the name with the count.
 *
 * The words are generated (`shared/copy/notification-bell.json`) and substituted
 * here rather than assembled from two fragments, so the punctuation stays in the
 * source both clients read (ADR-0098).
 */
internal fun notificationBellDescription(unreadCount: Int): String =
    if (unreadCount > 0) {
        NotificationBellCopy.UNREAD.replace("{count}", unreadCount.toString())
    } else {
        NotificationBellCopy.LABEL
    }

/**
 * The badge's own text: the count, or the site's cap.
 *
 * ASCII digits, always: the count is formatted here rather than by the platform's
 * locale, so an Arabic-locale phone cannot produce Arabic-Indic numerals in a
 * number the site draws as `12` (`npm run check:digits`, ADR-0054).
 */
internal fun notificationBadgeLabel(unreadCount: Int): String =
    if (unreadCount > NotificationsRepository.MAX_BADGE) {
        "${NotificationsRepository.MAX_BADGE}+"
    } else {
        unreadCount.toString()
    }
