package com.royaraqamia.app.linksnap

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The owned link's QR dialog (#943), ported from
 * `frontend/ui/linksnap/link-qr-modal.tsx`.
 *
 * The page encodes the short URL with the `qrcode` package (error correction M,
 * a one-module quiet zone) and draws the SVG in a dialog. The app encodes the
 * same URL with the same parameters from the ZXing reference implementation
 * already used for certificate seals ([VerifyQrCode]), so the two codes point at
 * the same link and scan the same way. The dialog's three faces are
 * [LinksnapQrUiState]: the wait, the matrix and the refusal.
 *
 * The gate's `qr` state measures the header and its words
 * (`shared/visual/account-links.json`); the matrix is proven by the encoder's
 * own round-trip test rather than by a raster, because two rasterizers never
 * draw a dense matrix identically.
 */
@Composable
internal fun LinksnapQrDialog(
    shortUrl: String,
    state: LinksnapQrUiState,
    open: Boolean,
    onDismiss: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!open) return

    Dialog(
        onDismissRequest = onDismiss,
        properties =
            DialogProperties(
                usePlatformDefaultWidth = false,
                dismissOnBackPress = true,
                dismissOnClickOutside = true,
            ),
    ) {
        LinksnapQrContent(
            shortUrl = shortUrl,
            state = state,
            onRetry = onRetry,
            modifier = modifier,
        )
    }
}

/**
 * The dialog's content, separate from the window so the visual gate can draw the
 * same boxes inside its own viewport instead of a second window's bounds.
 */
@Composable
internal fun LinksnapQrContent(
    shortUrl: String,
    state: LinksnapQrUiState,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .testTag(LinksnapQrMetrics.DIALOG)
                .width(LinksnapQrMetrics.dialogWidth)
                .background(
                    RoyColors.background,
                    RoundedCornerShape(LinksnapQrMetrics.dialogRadius),
                )
                .border(
                    LinksnapQrMetrics.borderWidth,
                    RoyColors.border,
                    RoundedCornerShape(LinksnapQrMetrics.dialogRadius),
                )
                .padding(LinksnapQrMetrics.dialogPadding),
        verticalArrangement = Arrangement.spacedBy(LinksnapQrMetrics.dialogGap),
    ) {
        QrHeader(shortUrl = shortUrl)

        Box(
            modifier =
                Modifier.fillMaxWidth()
                    .height(LinksnapQrMetrics.bodyHeight)
                    .background(
                        RoyColors.card,
                        RoundedCornerShape(LinksnapQrMetrics.bodyRadius),
                    )
                    .border(
                        LinksnapQrMetrics.borderWidth,
                        RoyColors.border,
                        RoundedCornerShape(LinksnapQrMetrics.bodyRadius),
                    ),
            contentAlignment = Alignment.Center,
        ) {
            when (state) {
                is LinksnapQrUiState.Loading -> LoadingFace()
                is LinksnapQrUiState.Failed -> FailedFace(onRetry = onRetry)
                is LinksnapQrUiState.Ready ->
                    QrMatrix(
                        matrix = state.matrix,
                        modifier =
                            Modifier.testTag(LinksnapQrMetrics.IMAGE)
                                .size(LinksnapQrMetrics.imageSize),
                    )
            }
        }
    }
}

@Composable
private fun QrHeader(shortUrl: String) {
    Column(
        modifier =
            Modifier.testTag(LinksnapQrMetrics.HEADER)
                .width(LinksnapQrMetrics.headerWidth)
                .padding(end = LinksnapQrMetrics.headerEndPadding),
    ) {
        Row(
            modifier = Modifier.height(LinksnapQrMetrics.titleRowHeight),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(LinksnapQrMetrics.titleGap),
        ) {
            Box(
                modifier =
                    Modifier.size(LinksnapQrMetrics.iconBox)
                        .background(
                            RoyColors.primary.copy(alpha = 0.1f),
                            RoundedCornerShape(LinksnapQrMetrics.iconBoxRadius),
                        )
                        .border(
                            LinksnapQrMetrics.borderWidth,
                            RoyColors.primary.copy(alpha = 0.15f),
                            RoundedCornerShape(LinksnapQrMetrics.iconBoxRadius),
                        ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = LucideVectors.QrCode,
                    contentDescription = null,
                    modifier = Modifier.size(LinksnapQrMetrics.iconSize),
                    tint = RoyColors.primary,
                )
            }
            Column {
                Text(
                    text = LinksnapQrCopy.TITLE,
                    modifier =
                        Modifier.testTag(LinksnapQrMetrics.TITLE)
                            .height(LinksnapQrMetrics.titleHeight),
                    style =
                        TextStyle(
                            fontSize = LinksnapQrMetrics.titleSize,
                            lineHeight = LinksnapQrMetrics.titleLineHeight,
                            fontWeight = FontWeight.Bold,
                            color = RoyColors.foreground,
                        ),
                )
                Spacer(Modifier.height(LinksnapQrMetrics.descriptionTopPadding))
                Text(
                    text = LinksnapQrCopy.DESCRIPTION,
                    modifier =
                        Modifier.testTag(LinksnapQrMetrics.DESCRIPTION)
                            .height(LinksnapQrMetrics.descriptionHeight),
                    style =
                        TextStyle(
                            fontSize = LinksnapQrMetrics.descriptionSize,
                            lineHeight = LinksnapQrMetrics.descriptionLineHeight,
                            color = RoyColors.mutedForeground,
                        ),
                    maxLines = 1,
                )
            }
        }

        Spacer(Modifier.height(LinksnapQrMetrics.headerGap))

        UrlLine(shortUrl = shortUrl)
    }
}

@Composable
private fun UrlLine(shortUrl: String) {
    Row(
        modifier =
            Modifier.testTag(LinksnapQrMetrics.URL_LINE)
                .fillMaxWidth()
                .height(LinksnapQrMetrics.urlLineHeight)
                .background(
                    RoyColors.muted.copy(alpha = 0.4f),
                    RoundedCornerShape(LinksnapQrMetrics.urlLineRadius),
                )
                .border(
                    LinksnapQrMetrics.borderWidth,
                    RoyColors.border,
                    RoundedCornerShape(LinksnapQrMetrics.urlLineRadius),
                )
                .padding(
                    horizontal = LinksnapQrMetrics.urlLinePaddingX,
                    vertical = LinksnapQrMetrics.urlLinePaddingY,
                ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(LinksnapQrMetrics.columnGap),
    ) {
        Text(
            text = LinksnapQrCopy.URL_LABEL,
            modifier =
                Modifier.testTag(LinksnapQrMetrics.URL_LABEL)
                    .height(LinksnapQrMetrics.urlTextHeight)
                    .weight(1f),
            style =
                TextStyle(
                    fontSize = LinksnapQrMetrics.urlTextSize,
                    lineHeight = LinksnapQrMetrics.urlLineHeightText,
                    fontWeight = FontWeight.Medium,
                    color = RoyColors.mutedForeground,
                ),
            maxLines = 1,
        )
        Text(
            text = shortUrl,
            modifier =
                Modifier.testTag(LinksnapQrMetrics.URL)
                    .height(LinksnapQrMetrics.urlTextHeight)
                    .widthIn(max = LinksnapQrMetrics.urlMaxWidth),
            style =
                TextStyle(
                    fontSize = LinksnapQrMetrics.urlTextSize,
                    lineHeight = LinksnapQrMetrics.urlLineHeightText,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = RoyColors.foreground,
                    textAlign = TextAlign.Left,
                    textDirection = TextDirection.Ltr,
                ),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun LoadingFace() {
    Row(
        modifier = Modifier.testTag(LinksnapQrMetrics.LOADING),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(LinksnapQrMetrics.faceGap),
    ) {
        Icon(
            imageVector = LucideVectors.LoaderCircle,
            contentDescription = null,
            modifier = Modifier.size(LinksnapQrMetrics.faceIconSize),
            tint = RoyColors.primary,
        )
        Text(
            text = LinksnapQrCopy.LOADING,
            style =
                TextStyle(
                    fontSize = LinksnapQrMetrics.faceTextSize,
                    lineHeight = LinksnapQrMetrics.faceTextLineHeight,
                    color = RoyColors.mutedForeground,
                ),
        )
    }
}

@Composable
private fun FailedFace(onRetry: () -> Unit) {
    Column(
        modifier = Modifier.testTag(LinksnapQrMetrics.ERROR),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(LinksnapQrMetrics.faceGap),
    ) {
        Icon(
            imageVector = LucideVectors.CircleAlert,
            contentDescription = null,
            modifier = Modifier.size(LinksnapQrMetrics.faceIconSize),
            tint = RoyColors.destructive,
        )
        Text(
            text = LinksnapQrCopy.ERROR_TITLE,
            style =
                TextStyle(
                    fontSize = LinksnapQrMetrics.faceTextSize,
                    lineHeight = LinksnapQrMetrics.faceTextLineHeight,
                    fontWeight = FontWeight.Bold,
                    color = RoyColors.destructive,
                ),
        )
        Text(
            text = LinksnapQrCopy.ERROR_BODY,
            style =
                TextStyle(
                    fontSize = LinksnapQrMetrics.faceTextSize,
                    lineHeight = LinksnapQrMetrics.faceTextLineHeight,
                    color = RoyColors.mutedForeground,
                ),
        )
        TextButton(
            onClick = onRetry,
            modifier = Modifier.testTag(LinksnapQrMetrics.RETRY),
        ) {
            Icon(
                imageVector = LucideVectors.RotateCcw,
                contentDescription = null,
                modifier = Modifier.size(LinksnapQrMetrics.faceIconSize),
                tint = RoyColors.foreground,
            )
            Text(
                text = LinksnapQrCopy.RETRY,
                style =
                    TextStyle(
                        fontSize = LinksnapQrMetrics.faceTextSize,
                        lineHeight = LinksnapQrMetrics.faceTextLineHeight,
                        fontWeight = FontWeight.Medium,
                        color = RoyColors.foreground,
                    ),
            )
        }
    }
}

@Composable
private fun QrMatrix(matrix: com.google.zxing.common.BitMatrix, modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val module = size.minDimension / matrix.width
        // The page paints the QR's dark modules in the foreground colour on the
        // background, which in the app's dark theme is the same light-on-dark
        // pair the site resolves from its tokens.
        drawRect(color = RoyColors.background)
        val ink = RoyColors.foreground
        for (x in 0 until matrix.width) {
            for (y in 0 until matrix.height) {
                if (matrix.get(x, y)) {
                    drawRect(
                        color = ink,
                        topLeft = Offset(x * module, y * module),
                        size = Size(module, module),
                    )
                }
            }
        }
    }
}

/**
 * The dialog's page numbers, which the visual gate compares box by box for the
 * `qr` state (`shared/visual/account-links.json`, ADR-0118).
 *
 * The header's three gaps are the page's own: the title row is 46 high (the
 * 40-high icon beside a 28-high title over a 16-high instruction), 20 between
 * that row and the URL line (`space-y-3` plus the line's `mt-2`), and the line
 * itself moves between two 1px borders with 10 of vertical padding over 16 of
 * text. The header is 339 wide including the page's `pe-8`, so the line inside it
 * is the 307 the page records.
 */
internal object LinksnapQrMetrics {
    const val DIALOG = "linksnap-qr-dialog"
    const val HEADER = "linksnap-qr-header"
    const val TITLE = "linksnap-qr-title"
    const val DESCRIPTION = "linksnap-qr-description"
    const val URL_LINE = "linksnap-qr-url-line"
    const val URL_LABEL = "linksnap-qr-url-label"
    const val URL = "linksnap-qr-url"
    const val IMAGE = "linksnap-qr-image"
    const val LOADING = "linksnap-qr-loading"
    const val ERROR = "linksnap-qr-error"
    const val RETRY = "linksnap-qr-retry"

    val headerWidth = 339.dp
    val headerEndPadding = 32.dp
    val dialogWidth = 387.dp
    val dialogRadius = 24.dp
    val dialogPadding = 24.dp
    val dialogGap = 24.dp
    val borderWidth = 1.dp

    val titleRowHeight = 46.dp
    val titleGap = 12.dp
    val iconBox = 40.dp
    val iconBoxRadius = 16.dp
    val iconSize = 20.dp
    val titleHeight = 28.dp
    val titleSize = 18.sp
    val titleLineHeight = 28.sp
    val descriptionHeight = 16.dp
    val descriptionTopPadding = 2.dp
    val descriptionSize = 12.sp
    val descriptionLineHeight = 16.sp
    val headerGap = 20.dp

    val urlLineHeight = 38.dp
    val urlLineRadius = 12.dp
    val urlLinePaddingX = 14.dp
    val urlLinePaddingY = 10.dp
    val urlTextSize = 12.sp
    val urlLineHeightText = 16.sp
    val urlTextHeight = 16.dp
    val columnGap = 8.dp

    val bodyHeight = 280.dp
    val bodyRadius = 16.dp
    val imageSize = 192.dp
    val urlMaxWidth = 240.dp

    val faceGap = 12.dp
    val faceIconSize = 20.dp
    val faceTextSize = 12.sp
    val faceTextLineHeight = 16.sp
}
