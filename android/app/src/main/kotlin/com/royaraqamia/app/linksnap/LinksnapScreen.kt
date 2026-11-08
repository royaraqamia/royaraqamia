package com.royaraqamia.app.linksnap

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.auth.SignInCopy
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.net.Connectivity
import com.royaraqamia.app.plans.PlanDates
import com.royaraqamia.app.store.linksnap.LinksnapLinkRow
import com.royaraqamia.app.store.linksnap.LinksnapRepository
import com.royaraqamia.app.store.linksnap.LinksnapStatus
import com.royaraqamia.app.sync.SyncPill
import com.royaraqamia.app.sync.SyncPillState
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import com.royaraqamia.app.verify.VerifyQrCode
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The owned-link list at rest (#941, #654).
 *
 * The page at `/account/links` is a member's own LinkSnap rows: the sync pill,
 * then one card per link carrying the code chip, the status pill, the protected
 * pill, the Hijri date pill and the destination. The bulk bar (#942), the row
 * actions and QR dialog (#943) and the edit dialog (#944) are the same page, and
 * the surface is switched on in `docs/mobile/screens.json` by this change.
 *
 * The order of the reads is HabitFlow's (#649) and SpendTrack's (#653), not a
 * third opinion: [LinksnapRepository.links] answers from the database and is
 * awaited *first*, so the frame after the shell's is the rows the last pull
 * wrote — a cold launch with the radio off paints from here. The drain and the
 * pull run beside them and never in front of them: a failure is a
 * [SyncPillState], not an empty list.
 *
 * It is on the shell's native routes now (`NativeSurfaces`) because all four
 * gated states - the row, the bulk bar, the QR dialog and the edit dialog - pass
 * `check:visual` (ADR-0118).
 */
@Composable
fun LinksnapScreen(
    repository: LinksnapRepository,
    siteUrl: String,
    signedIn: Boolean,
    modifier: Modifier = Modifier,
    onCopy: (String) -> Unit = {},
    onShare: (String) -> Unit = {},
    onOpenDocument: () -> Unit = {},
    onSignIn: () -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var rows by remember { mutableStateOf<List<LinksnapLinkRow>>(emptyList()) }
    var pill by remember { mutableStateOf<SyncPillState?>(null) }
    var copiedCode by remember { mutableStateOf<String?>(null) }
    var qrRow by remember { mutableStateOf<LinksnapLinkRow?>(null) }
    var editing by remember { mutableStateOf<LinksnapLinkRow?>(null) }
    var qrState by remember { mutableStateOf<LinksnapQrUiState>(LinksnapQrUiState.Loading) }
    var qrAttempt by remember { mutableStateOf(0) }
    val snackbar = remember { SnackbarHostState() }

    // The bar's selection outlives a scroll because it lives here rather than in
    // a row, and outlives a rotation because the saver writes the slugs to the
    // instance state (#942).
    val selection =
        rememberSaveable(saver = LinksnapBulkSelection.Saver) { LinksnapBulkSelection() }

    /** Repaint from the store alone: no network, no session, no wait. */
    suspend fun paint() {
        rows = if (signedIn) repository.links() else emptyList()
        // A pull or a drain can remove a selected row; the count must never say
        // more than the list shows.
        selection.retain(rows.map { it.code })
    }

    /**
     * The delivery half: drain what is queued, then pull what is new.
     *
     * A radio that is off is not a failed sync — it is the pill's Offline state,
     * and the queued count comes from the queue itself rather than from a guess.
     */
    suspend fun sync() {
        paint()
        if (!signedIn) {
            pill = null
            return
        }
        if (!Connectivity.isOnline(context)) {
            pill = SyncPillState.Offline(repository.outboxStatus().pending)
            return
        }
        pill = SyncPillState.Syncing
        val report = repository.drain()
        val pulled = repository.pull()
        paint()
        pill =
            when {
                report.failed > 0 -> SyncPillState.Failed(report.failed)
                pulled is ApiResult.Failure -> SyncPillState.RefreshFailed
                report.pending > 0 -> SyncPillState.Pending(report.pending)
                else -> null
            }
    }

    LaunchedEffect(repository, signedIn) { sync() }

    // The radio returning is the trigger "a queued write drains", so this screen
    // hears it too rather than waiting for a recomposition that may never come.
    DisposableEffect(repository) {
        val watch = Connectivity.watch(context) { scope.launch { sync() } }
        onDispose { watch.close() }
    }

    fun clientIdsFor(codes: Collection<String>): List<String> =
        rows.filter { it.code in codes }.map { it.clientId }

    /**
     * A bulk delete is one unordered set of tombstones, so it queues one intent.
     * The selection is cleared only after the rows and that intent are on disk,
     * which is the point the write is durable even if the process dies next.
     */
    fun deleteSelected() {
        val codes = selection.codes.toList()
        if (codes.isEmpty()) return
        scope.launch {
            repository.bulkDelete(clientIdsFor(codes))
            sync()
            // The bar's work is done once the write has been drained (or the
            // radio has answered that it cannot be), so the selection clears
            // then rather than lingering over rows that already changed.
            selection.clear()
        }
    }

    /** The page's bulk expiry, from the calendar day the bar's picker returned. */
    fun applyExpiry(day: String) {
        val codes = selection.codes.toList()
        if (codes.isEmpty()) return
        val instant =
            runCatching {
                    LocalDate.parse(day).atStartOfDay(ZoneOffset.UTC).toInstant().toString()
                }
                .getOrNull() ?: return
        scope.launch {
            repository.bulkSetExpiry(clientIdsFor(codes), instant)
            sync()
            selection.clear()
        }
    }

    /** The page's copy action on one row, with the tick the page shows after it. */
    fun copyLink(row: LinksnapLinkRow) {
        onCopy(LinksnapRoutes.shortUrl(siteUrl, row.code))
        copiedCode = row.code
        scope.launch {
            delay(2_000)
            if (copiedCode == row.code) copiedCode = null
        }
    }

    fun shareLink(row: LinksnapLinkRow) {
        onShare(LinksnapRoutes.shortUrl(siteUrl, row.code))
    }

    /**
     * The page's delete-then-undo (#943). The undo clears the same row's
     * tombstone through [LinksnapRepository.restoreLink], so the code is the one
     * the member deleted rather than a second short link.
     */
    fun deleteLink(row: LinksnapLinkRow) {
        scope.launch {
            val removed = repository.deleteLink(row.clientId)
            if (!removed) return@launch
            sync()
            val answer =
                snackbar.showSnackbar(
                    message = LinksnapRowActionsCopy.DELETED,
                    actionLabel = LinksnapRowActionsCopy.UNDO,
                    duration = SnackbarDuration.Long,
                )
            if (answer == SnackbarResult.ActionPerformed) {
                val restored = repository.restoreLink(row.clientId)
                sync()
                snackbar.showSnackbar(
                    if (restored != null) LinksnapRowActionsCopy.RESTORED
                    else LinksnapRowActionsCopy.RESTORE_FAILED
                )
            }
        }
    }

    fun openQr(row: LinksnapLinkRow) {
        qrRow = row
        qrAttempt += 1
    }

    LaunchedEffect(qrRow?.clientId, qrAttempt) {
        val row = qrRow ?: return@LaunchedEffect
        qrState = LinksnapQrUiState.Loading
        qrState =
            withContext(Dispatchers.Default) {
                val matrix =
                    VerifyQrCode.matrix(
                        content = LinksnapRoutes.shortUrl(siteUrl, row.code),
                        size = 240,
                        quietZone = 1,
                    )
                if (matrix != null) LinksnapQrUiState.Ready(matrix) else LinksnapQrUiState.Failed
            }
    }

    fun copySelected() {
        val urls = rows.filter { it.code in selection.codes }.map { "$siteUrl/${it.code}" }
        if (urls.isNotEmpty()) onCopy(urls.joinToString("\n"))
    }

    Box(modifier = modifier.fillMaxSize()) {
        LinksnapAccountList(
            rows = rows,
            pill = pill,
            signedIn = signedIn,
            onRetry = {
                scope.launch {
                    repository.retryFailed()
                    sync()
                }
            },
            onSignIn = onSignIn,
            selectedCodes = selection.codes,
            allSelected = selection.allSelected(rows.map { it.code }),
            onToggleSelect = selection::toggle,
            onToggleAll = { selection.toggleAll(rows.map { it.code }) },
            onClearSelection = selection::clear,
            onCopySelected = ::copySelected,
            onApplyExpiry = ::applyExpiry,
            onDeleteSelected = ::deleteSelected,
            copiedCode = copiedCode,
            onCopyLink = ::copyLink,
            onShareLink = ::shareLink,
            onAnalyticsLink = { onOpenDocument() },
            onEditLink = { editing = it },
            onQrLink = ::openQr,
            onDeleteLink = ::deleteLink,
            modifier = Modifier.fillMaxSize(),
        )

        // The one bottom transient the list shows: the delete's undo (#943).
        SnackbarHost(
            hostState = snackbar,
            modifier =
                Modifier.align(Alignment.BottomCenter)
                    .padding(LinksnapRowMetrics.pagePadding),
        )

        qrRow?.let { row ->
            LinksnapQrDialog(
                shortUrl = LinksnapRoutes.shortUrl(siteUrl, row.code),
                state = qrState,
                open = true,
                onDismiss = { qrRow = null },
                onRetry = { qrAttempt += 1 },
            )
        }

        editing?.let { row ->
            LinksnapEditDialog(
                row = row,
                siteUrl = siteUrl,
                online = Connectivity.isOnline(context),
                repository = repository,
                onDismiss = { editing = null },
                onSaved = { scope.launch { sync() } },
                onCopy = onCopy,
            )
        }
    }
}

/**
 * The list over its data, so the visual gate can draw it without a client
 * (#874, ADR-0118). `siteUrl` and the platform services are the caller's.
 */
@Composable
internal fun LinksnapAccountList(
    rows: List<LinksnapLinkRow>,
    pill: SyncPillState?,
    signedIn: Boolean,
    onRetry: () -> Unit,
    onSignIn: () -> Unit,
    modifier: Modifier = Modifier,
    selectedCodes: Set<String> = emptySet(),
    allSelected: Boolean = false,
    bulkBusy: Boolean = false,
    onToggleSelect: (String) -> Unit = {},
    onToggleAll: () -> Unit = {},
    onClearSelection: () -> Unit = {},
    onCopySelected: () -> Unit = {},
    onApplyExpiry: (String) -> Unit = {},
    onDeleteSelected: () -> Unit = {},
    copiedCode: String? = null,
    onCopyLink: (LinksnapLinkRow) -> Unit = {},
    onShareLink: (LinksnapLinkRow) -> Unit = {},
    onAnalyticsLink: (LinksnapLinkRow) -> Unit = {},
    onEditLink: (LinksnapLinkRow) -> Unit = {},
    onQrLink: (LinksnapLinkRow) -> Unit = {},
    onDeleteLink: (LinksnapLinkRow) -> Unit = {},
) {
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .background(RoyColors.background)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = LinksnapRowMetrics.pagePadding),
        verticalArrangement = Arrangement.spacedBy(LinksnapRowMetrics.listGap),
    ) {
        if (signedIn) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                pill?.let { SyncPill(state = it, onRetry = onRetry) }
            }

            if (rows.isEmpty()) {
                LinksnapEmptyState()
            } else {
                LinksnapBulkBar(
                    total = rows.size,
                    selectedCount = selectedCodes.size,
                    allSelected = allSelected,
                    busy = bulkBusy,
                    onToggleAll = onToggleAll,
                    onClear = onClearSelection,
                    onCopy = onCopySelected,
                    onApplyExpiry = onApplyExpiry,
                    onDelete = onDeleteSelected,
                )
                rows.forEach { row ->
                    LinksnapRowCard(
                        row = row,
                        selected = row.code in selectedCodes,
                        copied = copiedCode == row.code,
                        onToggleSelect = { onToggleSelect(row.code) },
                        onCopy = { onCopyLink(row) },
                        onShare = { onShareLink(row) },
                        onAnalytics = { onAnalyticsLink(row) },
                        onEdit = { onEditLink(row) },
                        onQr = { onQrLink(row) },
                        onDelete = { onDeleteLink(row) },
                    )
                }
            }
        } else {
            Row(
                modifier =
                    Modifier.fillMaxWidth()
                        .padding(top = LinksnapRowMetrics.listGap),
                horizontalArrangement = Arrangement.End,
            ) {
                TextButton(onClick = onSignIn) { Text(SignInCopy.TITLE) }
            }
        }
    }
}

/** One owned link's card: the page's box around the resting details. */
@Composable
private fun LinksnapRowCard(
    row: LinksnapLinkRow,
    selected: Boolean,
    copied: Boolean,
    onToggleSelect: () -> Unit,
    onCopy: () -> Unit,
    onShare: () -> Unit,
    onAnalytics: () -> Unit,
    onEdit: () -> Unit,
    onQr: () -> Unit,
    onDelete: () -> Unit,
) {
    Column(
        modifier =
            Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(LinksnapRowMetrics.cardRadius))
                .background(LinksnapRowMetrics.cardSurface)
                .border(
                    LinksnapRowMetrics.cardBorderWidth,
                    LinksnapRowMetrics.cardBorder,
                    RoundedCornerShape(LinksnapRowMetrics.cardRadius),
                )
                .padding(LinksnapRowMetrics.cardPadding),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(LinksnapRowMetrics.checkboxGap)) {
            LinksnapRowCheckbox(selected = selected, onClick = onToggleSelect)
            LinksnapRowSummary(
                state = LinksnapRowUiState.Painted(row),
                modifier = Modifier.weight(1f),
            )
        }

        Box(
            Modifier.fillMaxWidth()
                .padding(top = LinksnapRowMetrics.actionSeparatorGap)
                .height(LinksnapRowMetrics.actionSeparatorHeight)
                .background(LinksnapRowMetrics.actionSeparator),
        )
        LinksnapRowActions(
            code = row.code,
            copied = copied,
            analyticsExpanded = false,
            onCopy = onCopy,
            onShare = onShare,
            onAnalytics = onAnalytics,
            onEdit = onEdit,
            onQr = onQr,
            onDelete = onDelete,
        )
    }
}

/**
 * The row's selection box (#942), the page's `h-5 w-5` checkbox with its 2px
 * top inset. It is a checkbox a reader can press, so it carries the toggle role
 * rather than being a decorative square; the row's own words say which link it
 * belongs to.
 */
@Composable
private fun LinksnapRowCheckbox(selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier =
            Modifier.testTag(LinksnapRowMetrics.CHECKBOX)
                .padding(top = 2.dp)
                .size(LinksnapRowMetrics.checkboxWidth)
                .clip(RoundedCornerShape(LinksnapRowMetrics.checkboxRadius))
                .background(if (selected) RoyColors.foreground else LinksnapRowMetrics.checkboxSurface)
                .border(
                    LinksnapRowMetrics.cardBorderWidth,
                    if (selected) RoyColors.foreground else LinksnapRowMetrics.checkboxBorder,
                    RoundedCornerShape(LinksnapRowMetrics.checkboxRadius),
                )
                .toggleable(value = selected, role = Role.Checkbox, onValueChange = { onClick() }),
        contentAlignment = Alignment.Center,
    ) {
        if (selected) {
            Icon(
                imageVector = LucideVectors.Check,
                contentDescription = null,
                modifier = Modifier.size(LinksnapRowMetrics.checkboxIconSize),
                tint = RoyColors.background,
            )
        }
    }
}

/**
 * The resting half of a row: the code chip, the status pill, the protected pill,
 * the Hijri date pill and the destination (#941). Ported from
 * `frontend/ui/linksnap/link-row-summary.tsx`; every visible word is
 * [LinksnapRowCopy], generated from the same source the page reads.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun LinksnapRowSummary(
    state: LinksnapRowUiState,
    modifier: Modifier = Modifier,
) {
    when (state) {
        is LinksnapRowUiState.Painted -> {
            val row = state.row
            Column(
                modifier = modifier.testTag(LinksnapRowMetrics.SUMMARY),
                verticalArrangement = Arrangement.spacedBy(LinksnapRowMetrics.summaryGap),
            ) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(LinksnapRowMetrics.badgeGap),
                    verticalArrangement = Arrangement.spacedBy(LinksnapRowMetrics.badgeGap),
                    itemVerticalAlignment = Alignment.CenterVertically,
                ) {
                    CodeChip(row.code)
                    StatusPill(row)
                    if (row.passwordProtected) ProtectedPill()
                    DatePill(row.createdAt)
                }

                Text(
                    text = row.originalUrl,
                    modifier =
                        Modifier.testTag(LinksnapRowMetrics.DESTINATION)
                            .fillMaxWidth()
                            .height(LinksnapRowMetrics.destinationHeight),
                    style =
                        TextStyle(
                            fontSize = LinksnapRowMetrics.destinationSize,
                            lineHeight = LinksnapRowMetrics.destinationLineHeight,
                            color = LinksnapRowMetrics.destinationColor,
                        ),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun CodeChip(code: String) {
    Row(
        modifier =
            Modifier.testTag(LinksnapRowMetrics.CODE)
                .height(LinksnapRowMetrics.codeHeight)
                .clip(RoundedCornerShape(LinksnapRowMetrics.codeRadius))
                .background(LinksnapRowMetrics.codeSurface)
                .border(
                    LinksnapRowMetrics.badgeBorderWidth,
                    LinksnapRowMetrics.codeBorder,
                    RoundedCornerShape(LinksnapRowMetrics.codeRadius),
                )
                .padding(
                    horizontal = LinksnapRowMetrics.codePaddingX,
                    vertical = LinksnapRowMetrics.codePaddingY,
                ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(LinksnapRowMetrics.iconGap),
    ) {
        Text(
            text = "/$code",
            style =
                TextStyle(
                    fontSize = LinksnapRowMetrics.codeTextSize,
                    lineHeight = LinksnapRowMetrics.codeLineHeight,
                    fontWeight = LinksnapRowMetrics.codeWeight,
                    fontFamily = FontFamily.Monospace,
                    color = LinksnapRowMetrics.codeText,
                ),
        )
        Icon(
            imageVector = LucideVectors.ExternalLink,
            contentDescription = null,
            modifier = Modifier.size(LinksnapRowMetrics.iconSize).alpha(0.4f),
            tint = LinksnapRowMetrics.codeText,
        )
    }
}

@Composable
private fun StatusPill(row: LinksnapLinkRow) {
    val status = LinksnapStatus.of(row, System.currentTimeMillis())
    val tone =
        when (status) {
            "blocked" -> LinksnapRowMetrics.blocked
            "expired" -> LinksnapRowMetrics.expired
            else -> LinksnapRowMetrics.active
        }
    val label =
        when (status) {
            "blocked" -> LinksnapRowCopy.STATUS_BLOCKED
            "expired" -> LinksnapRowCopy.STATUS_EXPIRED
            else -> LinksnapRowCopy.STATUS_ACTIVE
        }
    Pill(
        tag = LinksnapRowMetrics.STATUS,
        surface = tone.surface,
        border = tone.border,
        content = tone.content,
        label = label,
        leading = { Dot(tone.dot) },
    )
}

@Composable
private fun ProtectedPill() {
    Pill(
        tag = LinksnapRowMetrics.PROTECTED,
        surface = LinksnapRowMetrics.protectedPill.surface,
        border = LinksnapRowMetrics.protectedPill.border,
        content = LinksnapRowMetrics.protectedPill.content,
        label = LinksnapRowCopy.PROTECTED_LABEL,
        leading = {
            Icon(
                imageVector = LucideVectors.Lock,
                contentDescription = null,
                modifier = Modifier.size(LinksnapRowMetrics.iconSize),
                tint = LinksnapRowMetrics.protectedPill.content,
            )
        },
    )
}

@Composable
private fun DatePill(createdAt: String) {
    Pill(
        tag = LinksnapRowMetrics.DATE,
        surface = LinksnapRowMetrics.datePill.surface,
        border = LinksnapRowMetrics.datePill.border,
        content = LinksnapRowMetrics.datePill.content,
        label = PlanDates.label(createdAt),
        leading = {
            Icon(
                imageVector = LucideVectors.Calendar,
                contentDescription = null,
                modifier = Modifier.size(LinksnapRowMetrics.iconSize),
                tint = LinksnapRowMetrics.dateIcon,
            )
        },
    )
}

@Composable
private fun Pill(
    tag: String,
    surface: Color,
    border: Color,
    content: Color,
    label: String,
    leading: @Composable () -> Unit,
) {
    Row(
        modifier =
            Modifier.testTag(tag)
                .height(LinksnapRowMetrics.pillHeight)
                .clip(CircleShape)
                .background(surface)
                .border(LinksnapRowMetrics.badgeBorderWidth, border, CircleShape)
                .padding(
                    horizontal = LinksnapRowMetrics.pillPaddingX,
                    vertical = LinksnapRowMetrics.pillPaddingY,
                ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(LinksnapRowMetrics.iconGap),
    ) {
        leading()
        Text(
            text = label,
            style =
                TextStyle(
                    fontSize = LinksnapRowMetrics.pillTextSize,
                    lineHeight = LinksnapRowMetrics.pillLineHeight,
                    fontWeight = LinksnapRowMetrics.pillWeight,
                    color = content,
                ),
        )
    }
}

@Composable
private fun Dot(color: Color) {
    Box(
        modifier =
            Modifier.size(LinksnapRowMetrics.dotSize)
                .clip(CircleShape)
                .background(color),
    )
}

/**
 * The page's own numbers, which the visual gate compares box by box
 * (`shared/visual/account-links.json`, ADR-0118).
 *
 * The colours are the page's dark-theme Tailwind values, transcribed because the
 * contract does not measure colour: the raster proves them. The card is
 * `dark:bg-neutral-950`, the destination `dark:text-neutral-400`, and each pill
 * carries the tone the site's `STATUS_META` and badges carry.
 */
internal object LinksnapRowMetrics {
    const val SUMMARY = "linksnap-row-summary"
    const val CODE = "linksnap-row-code"
    const val STATUS = "linksnap-row-status"
    const val PROTECTED = "linksnap-row-protected"
    const val DATE = "linksnap-row-date"
    const val DESTINATION = "linksnap-row-destination"
    const val CHECKBOX = "linksnap-row-checkbox"

    val pagePadding = 16.dp
    val listGap = 24.dp
    val summaryGap = 6.dp
    val badgeGap = 8.dp
    val actionSeparatorGap = 8.dp
    val actionSeparatorHeight = 1.dp
    val actionSeparator = Color(0xFF1F1F1F)
    val iconGap = 6.dp

    val cardRadius = 16.dp
    // The page's content box is its 16px padding inside a 1px border; Compose
    // draws the border on the bounds, so the inset is 17dp for the same width.
    val cardPadding = 17.dp
    val cardBorderWidth = 1.dp
    val cardSurface = Color(0xFF0A0A0A)
    val cardBorder = Color(0xFF262626)
    val checkboxWidth = 20.dp
    val checkboxGap = 14.dp
    val checkboxRadius = 6.dp
    val checkboxIconSize = 14.dp
    val checkboxSurface = Color(0x66141414)
    val checkboxBorder = Color(0xFF404040)

    val codeHeight = 30.dp
    val codeRadius = 8.dp
    val codePaddingX = 10.dp
    val codePaddingY = 4.dp
    val codeTextSize = 14.sp
    val codeLineHeight = 20.sp
    val codeWeight = FontWeight.Bold
    val codeSurface = Color(0xFF141414)
    val codeBorder = Color(0xFF262626)
    val codeText = Color(0xFFF5F5F5)

    val pillHeight = 22.dp
    val pillPaddingX = 10.dp
    val pillPaddingY = 2.dp
    val pillTextSize = 12.sp
    val pillLineHeight = 16.sp
    val pillWeight = FontWeight.Medium
    val badgeBorderWidth = 1.dp
    val iconSize = 12.dp
    val dotSize = 6.dp

    val destinationSize = 13.sp
    val destinationLineHeight = 21.13.sp
    val destinationHeight = 21.13.dp
    val destinationColor = Color(0xFFA3A3A3)

    val dateIcon = Color(0xFF737373)

    data class Tone(val surface: Color, val border: Color, val content: Color, val dot: Color)

    val active =
        Tone(
            surface = Color(0xFF071814),
            border = Color(0xFF083428),
            content = Color(0xFF34D399),
            dot = Color(0xFF10B981),
        )
    val expired =
        Tone(
            surface = Color(0xFF0E0E0E),
            border = Color(0xFF262626),
            content = Color(0xFFA3A3A3),
            dot = Color(0xFF737373),
        )
    val blocked =
        Tone(
            surface = Color(0xFF1A0A0F),
            border = Color(0xFF4C0519),
            content = Color(0xFFFB7185),
            dot = Color(0xFFF43F5E),
        )

    val protectedPill =
        Tone(
            surface = Color(0xFF221007),
            border = Color(0xFF4E250C),
            content = Color(0xFFFBBF24),
            dot = Color(0xFFFBBF24),
        )
    val datePill =
        Tone(
            surface = Color(0xFF0E0E0E),
            border = Color(0xFF262626),
            content = Color(0xFFA3A3A3),
            dot = Color(0xFF737373),
        )
}

internal fun messageFor(error: ApiError): String =
    when (error) {
        is ApiError.Network -> "يتطلَّب الاتصال بالإنترنت. تحقَّق من اتِّصالك ثم أعد المحاولة."
        ApiError.NotSignedIn -> "سجِّل الدُّخول للمتابعة."
        is ApiError.Server -> serverMessage(error)
        is ApiError.InvalidContract -> "تعذَّر قراءة رد الخادم."
    }

private fun serverMessage(error: ApiError.Server): String {
    val named =
        runCatching {
                Json.parseToJsonElement(error.detail).jsonObject["error"]?.jsonPrimitive?.content
            }
            .getOrNull()
    return named?.takeIf { it.isNotBlank() } ?: "تعذَّرت العملية. حاول مرَّة أخرى."
}
