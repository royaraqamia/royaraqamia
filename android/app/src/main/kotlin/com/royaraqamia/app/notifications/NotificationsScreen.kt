package com.royaraqamia.app.notifications

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.account.AccountRowsCopy
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.NotificationsResponseNotificationsItem
import com.royaraqamia.app.contracts.generated.NotificationsResponseNotificationsItemType
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.launch

/**
 * The site's `/notifications` as a screen (#1391, ADR-0118).
 *
 * The page's Alerts feed, read from the route its `NotificationContext` reads
 * (`/api/notifications`) and drawn with the page's row anatomy: the type's icon
 * in its rounded box, the title (bold until read), the two-line body, the
 * relative time and the same destination `notificationTarget` derives. The
 * mark-all, delete and row-open writes are requests followed by a re-read, so
 * the list and the bell both answer the server rather than a local guess.
 *
 * It is the app's half of the pair `docs/mobile/parity.json` lists, and it is
 * switched on only after `check:visual` records it as the same screen.
 */
@Composable
fun NotificationsScreen(
    repository: NotificationsRepository,
    signedIn: Boolean,
    onSignIn: () -> Unit,
    onOpenRoute: (String) -> Unit,
    onChanged: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<NotificationsUiState>(NotificationsUiState.Loading) }

    suspend fun read() {
        state = NotificationsUiState.from(repository.list())
    }

    LaunchedEffect(repository, signedIn) {
        if (!signedIn) {
            state = NotificationsUiState.SignedOut
            return@LaunchedEffect
        }
        state = NotificationsUiState.Loading
        read()
    }

    fun reload() {
        scope.launch {
            read()
            onChanged()
        }
    }

    fun markAll() {
        scope.launch {
            repository.markAllRead()
            read()
            onChanged()
        }
    }

    fun open(item: NotificationsResponseNotificationsItem) {
        val target = NotificationsRoutes.targetOf(item)
        scope.launch {
            if (!item.is_read) repository.markRead(item.id)
            read()
            onChanged()
            target?.let(onOpenRoute)
        }
    }

    fun delete(item: NotificationsResponseNotificationsItem) {
        scope.launch {
            repository.delete(item.id)
            read()
            onChanged()
        }
    }

    when (val current = state) {
        NotificationsUiState.Loading -> Panel {
            CircularProgressIndicator(
                modifier = Modifier.size(24.dp),
                color = RoyColors.primary,
                strokeWidth = 2.dp,
            )
            Spacer(Modifier.height(12.dp))
            Text(
                text = NotificationsCopy.LOADING,
                style =
                    TextStyle(
                        fontSize = NotificationsMetrics.panelTitleSize,
                        lineHeight = NotificationsMetrics.panelTitleLineHeight,
                        fontWeight = FontWeight.Medium,
                        color = RoyColors.mutedForeground,
                    ),
            )
        }
        NotificationsUiState.SignedOut -> Panel {
            PanelIcon(LucideVectors.Bell)
            Spacer(Modifier.height(NotificationsMetrics.panelIconGap))
            Text(
                text = NotificationsCopy.SIGN_IN_TITLE,
                style =
                    TextStyle(
                        fontSize = NotificationsMetrics.panelTitleSize,
                        lineHeight = NotificationsMetrics.panelTitleLineHeight,
                        fontWeight = FontWeight.Bold,
                        color = RoyColors.foreground,
                        textAlign = TextAlign.Center,
                    ),
            )
            Spacer(Modifier.height(NotificationsMetrics.panelIconGap))
            Box(
                modifier =
                    Modifier.clip(RoundedCornerShape(NotificationsMetrics.deleteRadius))
                        .background(RoyColors.primary)
                        .clickable(onClick = onSignIn)
                        .padding(horizontal = 16.dp, vertical = 10.dp),
            ) {
                Text(
                    text = AccountRowsCopy.SIGN_IN,
                    style =
                        TextStyle(
                            fontSize = NotificationsMetrics.panelTitleSize,
                            fontWeight = FontWeight.Bold,
                            color = RoyColors.primaryForeground,
                        ),
                )
            }
        }
        is NotificationsUiState.Failed -> Panel {
            PanelIcon(LucideVectors.Bell)
            Spacer(Modifier.height(NotificationsMetrics.panelIconGap))
            Text(
                text = NotificationsCopy.LIST_ERROR,
                style =
                    TextStyle(
                        fontSize = NotificationsMetrics.panelTitleSize,
                        lineHeight = NotificationsMetrics.panelTitleLineHeight,
                        fontWeight = FontWeight.Bold,
                        color = RoyColors.foreground,
                        textAlign = TextAlign.Center,
                    ),
            )
            Spacer(Modifier.height(NotificationsMetrics.panelIconGap))
            Box(
                modifier =
                    Modifier.clip(RoundedCornerShape(NotificationsMetrics.deleteRadius))
                        .border(1.dp, NotificationsMetrics.listBorderColor)
                        .clickable(onClick = ::reload)
                        .padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                Text(
                    text = NotificationsCopy.RETRY,
                    style =
                        TextStyle(
                            fontSize = NotificationsMetrics.panelBodySize,
                            fontWeight = FontWeight.Medium,
                            color = RoyColors.foreground,
                        ),
                )
            }
        }
        is NotificationsUiState.Ready -> {
            val unread = current.notifications.count { !it.is_read }
            Column(
                modifier =
                    modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = NotificationsMetrics.horizontalPadding)
                        .padding(top = 24.dp),
            ) {
                if (unread > 0) {
                    MarkAllRow(onMarkAll = ::markAll)
                    Spacer(Modifier.height(12.dp))
                }

                if (current.isEmpty) {
                    EmptyPanel()
                } else {
                    NotificationList(
                        notifications = current.notifications,
                        onOpen = ::open,
                        onDelete = ::delete,
                    )
                }
            }
        }
    }
}

/** The page's column above the list: `mb-3` and the one action it offers. */
@Composable
private fun MarkAllRow(onMarkAll: () -> Unit) {
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
        Row(
            modifier =
                Modifier.clip(RoundedCornerShape(NotificationsMetrics.deleteRadius))
                    .clickable(onClick = onMarkAll)
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = LucideVectors.Check,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = RoyColors.primary,
            )
            Text(
                text = NotificationsCopy.MARK_ALL_READ,
                style =
                    TextStyle(
                        fontSize = NotificationsMetrics.panelBodySize,
                        fontWeight = FontWeight.Medium,
                        color = RoyColors.primary,
                    ),
            )
        }
    }
}

/** The page's list: one rounded, bordered card with a rule between its rows. */
@Composable
private fun NotificationList(
    notifications: List<NotificationsResponseNotificationsItem>,
    onOpen: (NotificationsResponseNotificationsItem) -> Unit,
    onDelete: (NotificationsResponseNotificationsItem) -> Unit,
) {
    val shape = RoundedCornerShape(NotificationsMetrics.listRadius)
    Column(
        modifier =
            Modifier.fillMaxWidth()
                .testTag(NotificationsMetrics.LIST)
                .clip(shape)
                .background(NotificationsMetrics.cardSurface)
                .border(NotificationsMetrics.listBorder, NotificationsMetrics.listBorderColor, shape),
    ) {
        notifications.forEachIndexed { index, item ->
            if (index > 0) {
                HorizontalDivider(
                    thickness = 1.dp,
                    color = NotificationsMetrics.rowDivider,
                )
            }
            NotificationRow(
                item = item,
                onOpen = { onOpen(item) },
                onDelete = { onDelete(item) },
            )
        }
    }
}

/** One row's anatomy, in the page's order and with its unread treatment. */
@Composable
private fun NotificationRow(
    item: NotificationsResponseNotificationsItem,
    onOpen: () -> Unit,
    onDelete: () -> Unit,
) {
    val read = item.is_read
    val shape = RoundedCornerShape(NotificationsMetrics.listRadius)

    Box(
        modifier =
            Modifier.fillMaxWidth()
                .testTag(NotificationsMetrics.ROW)
                .background(if (read) Color.Transparent else NotificationsMetrics.rowUnreadSurface)
                .clickable(onClick = onOpen)
                .clip(shape),
    ) {
        Row(
            modifier =
                Modifier.fillMaxWidth()
                    .padding(
                        start = NotificationsMetrics.rowPaddingHorizontal,
                        end = NotificationsMetrics.rowEndPadding,
                        top = NotificationsMetrics.rowPaddingVertical,
                        bottom = NotificationsMetrics.rowPaddingVertical,
                    ),
            horizontalArrangement = Arrangement.spacedBy(NotificationsMetrics.iconGap),
            verticalAlignment = Alignment.Top,
        ) {
            Box(
                modifier =
                    Modifier.size(NotificationsMetrics.iconSize)
                        .testTag(NotificationsMetrics.ICON)
                        .clip(RoundedCornerShape(NotificationsMetrics.iconRadius))
                        .background(
                            if (read) NotificationsMetrics.iconReadSurface
                            else NotificationsMetrics.iconUnreadSurface
                        )
                        .then(
                            if (read) Modifier
                            else Modifier.border(
                                1.dp,
                                NotificationsMetrics.iconUnreadRing,
                                RoundedCornerShape(NotificationsMetrics.iconRadius),
                            )
                        ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = iconFor(item.type),
                    contentDescription = null,
                    modifier = Modifier.size(NotificationsMetrics.glyphSize),
                    tint = if (read) RoyColors.mutedForeground else RoyColors.primary,
                )
            }

            Column(modifier = Modifier.weight(1f).padding(top = NotificationsMetrics.textTop)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = item.title,
                        modifier = Modifier.testTag(NotificationsMetrics.TITLE),
                        style =
                            TextStyle(
                                fontSize = NotificationsMetrics.titleSize,
                                lineHeight = NotificationsMetrics.titleLineHeight,
                                fontWeight =
                                    if (read) NotificationsMetrics.titleWeightRead
                                    else NotificationsMetrics.titleWeightUnread,
                                color =
                                    if (read) RoyColors.foreground.copy(alpha = 0.8f)
                                    else RoyColors.foreground,
                            ),
                    )
                    if (!read) {
                        UnreadDot()
                    }
                }

                item.body?.let { body ->
                    Spacer(Modifier.height(NotificationsMetrics.bodyTop))
                    Text(
                        text = body,
                        modifier = Modifier.testTag(NotificationsMetrics.BODY),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        style =
                            TextStyle(
                                fontSize = NotificationsMetrics.bodySize,
                                lineHeight = NotificationsMetrics.bodyLineHeight,
                                fontWeight = FontWeight.Normal,
                                color = RoyColors.mutedForeground.copy(alpha = 0.8f),
                            ),
                    )
                }

                Spacer(Modifier.height(NotificationsMetrics.timeTop))
                Text(
                    text = NotificationsText.timeAgo(item.created_at),
                    modifier =
                        Modifier.height(NotificationsMetrics.timeHeight)
                            .testTag(NotificationsMetrics.TIME),
                    style =
                        TextStyle(
                            fontSize = NotificationsMetrics.timeSize,
                            lineHeight = NotificationsMetrics.timeLineHeight,
                            fontWeight = FontWeight.Medium,
                            color = RoyColors.mutedForeground.copy(alpha = 0.6f),
                        ),
                )
            }
        }

        Box(
            modifier =
                Modifier.align(Alignment.TopEnd)
                    .padding(
                        top = NotificationsMetrics.deleteTop,
                        end = NotificationsMetrics.deleteEnd,
                    )
                    .size(NotificationsMetrics.deleteSize)
                    .testTag(NotificationsMetrics.DELETE)
                    .clip(RoundedCornerShape(NotificationsMetrics.deleteRadius))
                    .clickable(onClick = onDelete),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = LucideVectors.X,
                contentDescription = NotificationsCopy.DELETE_LABEL,
                modifier = Modifier.size(NotificationsMetrics.deleteGlyphSize),
                tint = RoyColors.mutedForeground.copy(alpha = 0.7f),
            )
        }
    }
}

/** `h-2 w-2` with the page's 4px ring; the tagged box is the dot itself. */
@Composable
private fun UnreadDot() {
    Box(
        modifier = Modifier.size(NotificationsMetrics.unreadDot + NotificationsMetrics.unreadRing * 2f),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier.size(NotificationsMetrics.unreadDot + NotificationsMetrics.unreadRing * 2f)
                .background(NotificationsMetrics.iconUnreadRing, CircleShape)
        )
        Box(
            modifier =
                Modifier.size(NotificationsMetrics.unreadDot)
                    .testTag(NotificationsMetrics.UNREAD)
                    .semantics { contentDescription = NotificationsCopy.UNREAD_LABEL }
                    .background(RoyColors.primary, CircleShape),
        )
    }
}

/** The page's empty frame: a bordered card with its icon, title and sentence. */
@Composable
private fun EmptyPanel() {
    Panel(tag = NotificationsMetrics.EMPTY, height = NotificationsMetrics.panelHeight) {
        PanelIcon(LucideVectors.Bell)
        Spacer(Modifier.height(NotificationsMetrics.panelIconGap))
        Text(
            text = NotificationsCopy.EMPTY_TITLE,
            style =
                TextStyle(
                    fontSize = NotificationsMetrics.panelTitleSize,
                    lineHeight = NotificationsMetrics.panelTitleLineHeight,
                    fontWeight = FontWeight.Bold,
                    color = RoyColors.foreground,
                    textAlign = TextAlign.Center,
                ),
        )
        Spacer(Modifier.height(NotificationsMetrics.panelBodyTop))
        Text(
            text = NotificationsCopy.EMPTY_BODY,
            style =
                TextStyle(
                    fontSize = NotificationsMetrics.panelBodySize,
                    lineHeight = NotificationsMetrics.panelBodyLineHeight,
                    fontWeight = FontWeight.Normal,
                    color = RoyColors.mutedForeground.copy(alpha = 0.7f),
                    textAlign = TextAlign.Center,
                ),
        )
    }
}

/** The page's one empty/loading frame, so every state has the same rhythm. */
@Composable
private fun Panel(
    tag: String? = null,
    height: androidx.compose.ui.unit.Dp? = null,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(NotificationsMetrics.panelRadius)
    Column(
        modifier =
            Modifier.fillMaxWidth()
                .then(if (height != null) Modifier.height(height) else Modifier)
                .then(if (tag != null) Modifier.testTag(tag) else Modifier)
                .clip(shape)
                .background(NotificationsMetrics.cardSurface)
                .border(1.dp, NotificationsMetrics.listBorderColor, shape)
                .padding(
                    horizontal = NotificationsMetrics.panelPaddingHorizontal,
                    vertical = NotificationsMetrics.panelPaddingVertical,
                ),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        content = content,
    )
}

@Composable
private fun PanelIcon(vector: ImageVector) {
    Box(
        modifier =
            Modifier.size(
                    NotificationsMetrics.panelIconGlyph + NotificationsMetrics.panelIconPadding * 2f
                )
                .clip(CircleShape)
                .background(RoyColors.muted.copy(alpha = 0.6f))
                .border(1.dp, RoyColors.border.copy(alpha = 0.4f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = vector,
            contentDescription = null,
            modifier = Modifier.size(NotificationsMetrics.panelIconGlyph),
            tint = RoyColors.mutedForeground.copy(alpha = 0.8f),
        )
    }
}

/** The type's glyph, from the same generated vectors the site's icons come from (ADR-0100). */
@Composable
private fun iconFor(type: NotificationsResponseNotificationsItemType): ImageVector =
    when (type) {
        NotificationsResponseNotificationsItemType.CERTIFICATE_ISSUED -> LucideVectors.BadgeCheck
        NotificationsResponseNotificationsItemType.HABIT_REMINDER -> LucideVectors.CircleCheck
        NotificationsResponseNotificationsItemType.RECOVERY_NUDGE -> LucideVectors.CalendarClock
        NotificationsResponseNotificationsItemType.EXPENSE_ALERT -> LucideVectors.CircleDollarSign
        NotificationsResponseNotificationsItemType.LINK_CLICKED -> LucideVectors.Link2
        NotificationsResponseNotificationsItemType.SYSTEM_ANNOUNCEMENT -> LucideVectors.Megaphone
        NotificationsResponseNotificationsItemType.TRAINING_APPLICATION -> LucideVectors.GraduationCap
        NotificationsResponseNotificationsItemType.CONSULTATION_BOOKING ->
            LucideVectors.CalendarCheck2
        NotificationsResponseNotificationsItemType.CHAT_REQUEST -> LucideVectors.MessagesSquare
        NotificationsResponseNotificationsItemType.NEW_FOLLOWER -> LucideVectors.UserPlus
        NotificationsResponseNotificationsItemType.PROJECT_REQUEST,
        NotificationsResponseNotificationsItemType.RETAINER_REQUEST,
        NotificationsResponseNotificationsItemType.SUBSCRIPTION_REQUEST -> LucideVectors.Bell
    }
