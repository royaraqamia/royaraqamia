package com.royaraqamia.app.scan

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.graphics.SurfaceTexture
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.Surface
import android.view.TextureView
import android.view.WindowManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyShape
import com.royaraqamia.app.ui.vectors.LucideVectors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Where `/scan` has got to. The camera is open only in [Starting] and [Scanning]. */
internal enum class ScanStatus {
    Idle,
    Starting,
    Scanning,
    Result,
}

/**
 * The site's `/scan` as a screen (#932).
 *
 * The Scanner's work is the camera: a permission the visitor grants, a preview,
 * and a decode that happens on the device. No frame and no uploaded picture is
 * ever sent anywhere (ADR-0034); the only destination a result leads to is the
 * page's own — a link opens in the platform browser, and one of our
 * `/verify/<code>` links opens the certificate screen.
 *
 * A visitor with no camera, or one who refuses the permission, gets the page's
 * sentence and the upload picker rather than a black rectangle. The picker reads
 * the chosen picture through the same decoder, so the no-camera path is a real
 * way to scan rather than an apology.
 *
 * The port is drawn and switched off until the visual gate passes (ADR-0117),
 * so the shell still hands `/scan` to the document in the meantime. That is also
 * why this screen's words are still the page's inline ones: the pair lands with
 * the gate slice that can measure both drawings.
 */
@Composable
fun ScanScreen(
    siteUrl: String,
    modifier: Modifier = Modifier,
    onOpenRoute: (String) -> Unit = {},
    onOpenExternal: (String) -> Unit = {},
    onCopy: (String) -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val main = remember { Handler(Looper.getMainLooper()) }
    val controller = remember { mutableStateOf<ScanCameraController?>(null) }
    val accepted = remember { AtomicBoolean(false) }
    // Each camera session gets a token, so a frame callback that outlives its
    // session (a stop, a rescan) cannot paint a result from the session before.
    val generation = remember { AtomicInteger(0) }

    val hasCamera =
        remember(context) {
            context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)
        }
    var granted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    var status by remember { mutableStateOf(ScanStatus.Idle) }
    var message by remember { mutableStateOf<String?>(null) }
    var hit by remember { mutableStateOf<ScanHit?>(null) }
    var busy by remember { mutableStateOf(false) }
    var torchAvailable by remember { mutableStateOf(false) }
    var torchOn by remember { mutableStateOf(false) }

    fun releaseCamera() {
        generation.incrementAndGet()
        controller.value?.stop()
        controller.value = null
        torchAvailable = false
        torchOn = false
    }

    fun stopCamera() {
        releaseCamera()
        if (status != ScanStatus.Result) status = ScanStatus.Idle
    }

    fun accept(code: ScanHit, fromCamera: Boolean = false) {
        // A frame that was already decoding when the visitor stopped cannot
        // become the result of a session that is over.
        if (fromCamera && status != ScanStatus.Starting && status != ScanStatus.Scanning) return
        if (!accepted.compareAndSet(false, true)) return
        releaseCamera()
        message = null
        hit = code
        status = ScanStatus.Result
    }

    val permission =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { result ->
            granted = result
            if (result) {
                accepted.set(false)
                generation.incrementAndGet()
                hit = null
                message = null
                status = ScanStatus.Starting
            } else {
                status = ScanStatus.Idle
                message = ScanMessages.PERMISSION_DENIED
            }
        }

    /** Starts the preview, asking for the permission first when it is not held. */
    fun startScanning() {
        message = null
        if (!hasCamera) {
            message = ScanMessages.NO_CAMERA
            status = ScanStatus.Idle
            return
        }
        if (!granted) {
            permission.launch(Manifest.permission.CAMERA)
            return
        }
        accepted.set(false)
        generation.incrementAndGet()
        hit = null
        status = ScanStatus.Starting
    }

    val picture =
        rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            if (uri == null) return@rememberLauncherForActivityResult
            scope.launch {
                busy = true
                message = null
                stopCamera()
                val answer = withContext(Dispatchers.IO) { decodePicture(context, uri) }
                busy = false
                when (answer) {
                    PictureAnswer.NotAnImage -> message = ScanMessages.NOT_AN_IMAGE
                    null -> message = ScanMessages.NO_CODE_IN_IMAGE
                    is PictureAnswer.Found -> accept(answer.hit)
                }
            }
        }

    DisposableEffect(Unit) {
        onDispose {
            generation.incrementAndGet()
            controller.value?.stop()
            controller.value = null
        }
    }

    ScanView(
        state =
            ScanViewState(
                status = status,
                message = message,
                hit = hit,
                busy = busy,
                hasCamera = hasCamera,
                torchAvailable = torchAvailable,
                torchOn = torchOn,
            ),
        siteUrl = siteUrl,
        onStart = ::startScanning,
        onStop = ::stopCamera,
        onTorch = {
            val next = !torchOn
            controller.value?.setTorch(next)
            torchOn = next
        },
        onUpload = { picture.launch("image/*") },
        onRescan = ::startScanning,
        onCopy = onCopy,
        onOpenRoute = onOpenRoute,
        onOpenExternal = onOpenExternal,
        modifier = modifier,
        cameraPreview = {
            CameraPreview(
                controller = controller,
                generation = generation,
                onReady = {
                    main.post {
                        if (controller.value != null && status == ScanStatus.Starting) {
                            status = ScanStatus.Scanning
                        }
                    }
                },
                onFailure = {
                    main.post {
                        if (controller.value != null) {
                            stopCamera()
                            message = ScanMessages.CAMERA_FAILED
                        }
                    }
                },
                onTorchAvailable = { available -> main.post { torchAvailable = available } },
                onFrame = { luma, width, height ->
                    val found = ScanDecoder.decodeLuminance(luma, width, height)
                    if (found != null) main.post { accept(found, fromCamera = true) }
                },
            )
        },
    )
}

/** What the scanner is drawing, with the camera's own state lifted out of it. */
internal data class ScanViewState(
    val status: ScanStatus,
    val message: String?,
    val hit: ScanHit?,
    val busy: Boolean,
    val hasCamera: Boolean,
    val torchAvailable: Boolean,
    val torchOn: Boolean,
)

/**
 * The scanner's drawing, without the camera (#1344, ADR-0118).
 *
 * The screen holds the permission, the preview and the decode; this takes the
 * state those produce and draws it, so the visual test can compose `at-rest`,
 * `denied` and `result` from a fake camera without a device. The live preview is a
 * slot because neither client can record a MediaStream as evidence: the test
 * passes nothing, and the shipping screen passes the same [CameraPreview] it
 * always drew.
 */
@Composable
internal fun ScanView(
    state: ScanViewState,
    siteUrl: String,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onTorch: () -> Unit,
    onUpload: () -> Unit,
    onRescan: () -> Unit,
    onOpenRoute: (String) -> Unit,
    onOpenExternal: (String) -> Unit,
    onCopy: (String) -> Unit,
    modifier: Modifier = Modifier,
    cameraPreview: @Composable () -> Unit = {},
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val status = state.status
    val scanning = status == ScanStatus.Scanning

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .background(RoyColors.background)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = spacing.containerPadding, vertical = ScanMetrics.pageTop),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(ScanMetrics.titleToCard),
    ) {
        Text(
            text = ScanMessages.TITLE,
            style =
                type.h1.copy(
                    fontSize = ScanMetrics.titleSize,
                    lineHeight = ScanMetrics.titleLineHeight,
                    fontWeight = ScanMetrics.titleWeight,
                ),
            color = RoyColors.foreground,
            textAlign = TextAlign.Center,
            modifier =
                Modifier.fillMaxWidth()
                    .height(ScanMetrics.titleHeight)
                    .testTag(ScanMetrics.TITLE)
                    .semantics { heading() },
        )

        val current = state.hit
        if (current != null) {
            ScanResultCard(
                hit = current,
                siteUrl = siteUrl,
                onOpenRoute = onOpenRoute,
                onOpenExternal = onOpenExternal,
                onCopy = onCopy,
                onRescan = onRescan,
            )
            return@Column
        }

        Card(
            modifier = Modifier.fillMaxWidth().testTag(ScanMetrics.CARD),
            shape = Recipes.Card.radius,
            colors = CardDefaults.cardColors(containerColor = Recipes.Card.container),
            border = Recipes.Card.border,
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(ScanMetrics.cardPadding),
                verticalArrangement = Arrangement.spacedBy(ScanMetrics.cardGap),
            ) {
                Box(
                    modifier =
                        Modifier.fillMaxWidth()
                            .aspectRatio(4f / 3f)
                            .clip(RoundedCornerShape(ScanMetrics.viewfinderRadius))
                            .background(Color.Black.copy(alpha = 0.9f))
                            .testTag(ScanMetrics.VIEWFINDER),
                    contentAlignment = Alignment.Center,
                ) {
                    if (status == ScanStatus.Starting || status == ScanStatus.Scanning) {
                        cameraPreview()
                    }

                    if (status != ScanStatus.Scanning) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement =
                                Arrangement.spacedBy(ScanMetrics.glyphToButton),
                        ) {
                            Icon(
                                imageVector = LucideVectors.ScanBarcode,
                                contentDescription = null,
                                tint = Color.White.copy(alpha = 0.8f),
                                modifier = Modifier.size(48.dp),
                            )
                            if (state.hasCamera) {
                                Button(
                                    onClick = onStart,
                                    enabled = !state.busy,
                                    modifier =
                                        Modifier.height(ScanMetrics.buttonHeight)
                                            .testTag(ScanMetrics.START),
                                    shape = RoyShape.pill,
                                    contentPadding = PaddingValues(horizontal = 24.dp),
                                    colors =
                                        ButtonDefaults.buttonColors(
                                            containerColor = RoyColors.primary,
                                            contentColor = RoyColors.primaryForeground,
                                        ),
                                ) {
                                    if (status == ScanStatus.Starting) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(18.dp),
                                            strokeWidth = 2.dp,
                                            color = RoyColors.primaryForeground,
                                        )
                                    } else {
                                        Icon(
                                            imageVector = LucideVectors.Camera,
                                            contentDescription = null,
                                            modifier = Modifier.size(Recipes.Glyph.sm),
                                        )
                                    }
                                    Text(
                                        text =
                                            if (status == ScanStatus.Starting) {
                                                ScanMessages.STARTING
                                            } else {
                                                ScanMessages.START
                                            },
                                        style =
                                            type.body.copy(fontWeight = FontWeight.Bold),
                                        modifier = Modifier.padding(start = 10.dp),
                                    )
                                }
                            } else {
                                Text(
                                    text = ScanMessages.NO_CAMERA,
                                    style = type.xs.copy(lineHeight = 16.sp),
                                    color = Color.White.copy(alpha = 0.8f),
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.padding(horizontal = 16.dp),
                                )
                            }
                        }
                    } else {
                        Row(
                            modifier =
                                Modifier.align(Alignment.BottomCenter)
                                    .fillMaxWidth()
                                    .background(
                                        Brush.verticalGradient(
                                            listOf(Color.Transparent, Color.Black.copy(alpha = 0.75f))
                                        )
                                    )
                                    .padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = ScanMessages.SCANNING_HINT,
                                style = type.xs.copy(lineHeight = 16.sp),
                                color = Color.White.copy(alpha = 0.8f),
                            )
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                if (state.torchAvailable) {
                                    TextButton(onClick = onTorch) {
                                        Text(
                                            text =
                                                if (state.torchOn) {
                                                    ScanMessages.TORCH_OFF
                                                } else {
                                                    ScanMessages.TORCH_ON
                                                }
                                        )
                                    }
                                }
                                OutlinedButton(onClick = onStop) {
                                    Text(ScanMessages.STOP)
                                }
                            }
                        }
                    }
                }

                state.message?.let {
                    Notice(
                        it,
                        destructive = true,
                        icon = false,
                        modifier = Modifier.testTag(ScanMetrics.NOTICE),
                    )
                }

                Column(
                    modifier =
                        Modifier.fillMaxWidth()
                            .testTag(ScanMetrics.UPLOAD)
                            .border(
                                1.dp,
                                RoyColors.border.copy(alpha = 0.7f),
                                RoundedCornerShape(ScanMetrics.uploadRadius),
                            )
                            .padding(ScanMetrics.uploadPadding),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(ScanMetrics.uploadGap),
                ) {
                    Text(
                        text = ScanMessages.UPLOAD_HINT,
                        style = type.xs.copy(lineHeight = 16.sp),
                        color = RoyColors.mutedForeground,
                        textAlign = TextAlign.Center,
                        modifier =
                            Modifier.height(ScanMetrics.hintHeight)
                                .testTag(ScanMetrics.UPLOAD_HINT),
                    )
                    OutlinedButton(
                        onClick = onUpload,
                        enabled = !state.busy && status != ScanStatus.Starting,
                        modifier =
                            Modifier.height(ScanMetrics.smallButtonHeight)
                                .testTag(ScanMetrics.UPLOAD_BUTTON),
                        shape = RoyShape.pill,
                        contentPadding = PaddingValues(horizontal = 24.dp),
                    ) {
                        if (state.busy) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = RoyColors.foreground,
                            )
                        } else {
                            Icon(
                                imageVector = LucideVectors.Upload,
                                contentDescription = null,
                                modifier = Modifier.size(Recipes.Glyph.sm),
                            )
                        }
                        Text(
                            text = if (state.busy) ScanMessages.READING else ScanMessages.UPLOAD,
                            style = type.body.copy(fontWeight = FontWeight.Bold),
                            modifier = Modifier.padding(start = 10.dp),
                        )
                    }
                }
            }
        }
    }
}

/**
 * The page's boxes at 393 CSS px, as one source the screen and its test share
 * (#1344, ADR-0118). The title is the page's SectionTitle (30/37.5, extrabold,
 * 46.5 tall with the gradient's own padding); the card's 1px border is painted
 * inside Compose's bounds, so 20px of the page's padding plus that border is 21
 * here, which keeps the 319px viewfinder and every box under it on the page's
 * rows.
 */
internal object ScanMetrics {
    const val TITLE = "scan-title"
    const val CARD = "scan-card"
    const val VIEWFINDER = "scan-viewfinder"
    const val START = "scan-start"
    const val NOTICE = "scan-notice"
    const val UPLOAD = "scan-upload"
    const val UPLOAD_HINT = "scan-upload-hint"
    const val UPLOAD_BUTTON = "scan-upload-button"
    const val RESULT_CARD = "scan-result-card"
    const val RESULT_BADGES = "scan-result-badges"
    const val RESULT_PAYLOAD = "scan-result-payload"
    const val RESULT_ACTIONS = "scan-result-actions"
    const val RESULT_COPY = "scan-result-copy"
    const val RESULT_RESCAN = "scan-result-rescan"

    val pageTop = 40.dp
    val titleToCard = 24.dp
    val titleSize = 30.sp
    val titleLineHeight = 37.5.sp
    val titleHeight = 46.5.dp
    val titleWeight = FontWeight.ExtraBold

    val cardPadding = 21.dp
    val cardRadius = 16.dp
    val cardGap = 16.dp
    val viewfinderRadius = 16.dp
    val glyphToButton = 16.dp
    val buttonHeight = 48.dp
    val smallButtonHeight = 48.dp
    val uploadPadding = 17.dp
    val uploadGap = 12.dp
    val uploadRadius = 12.dp
    val hintHeight = 16.dp
    val noticeRadius = 12.dp
    val noticePadding = 12.dp

    val resultBadgeHeight = 24.dp
    val resultPayloadRadius = 12.dp
    val resultPayloadMinHeight = 45.dp
    val resultPadding = 12.dp
    val resultGap = 16.dp

    /** The button and body sizes the page's `text-base` and `text-xs` resolve to. */
    val buttonTextSize = 16
    val buttonTextWeight = FontWeight.Bold.weight
    val hintTextSize = 12
    val noticeTextSize = 14
}

/** The result the page draws after a code is read: payload, destination, action. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ScanResultCard(
    hit: ScanHit,
    siteUrl: String,
    onOpenRoute: (String) -> Unit,
    onOpenExternal: (String) -> Unit,
    onCopy: (String) -> Unit,
    onRescan: () -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val classification = remember(hit) { ScanClassifier.classify(hit.rawValue) }
    val certificateCode =
        remember(hit, siteUrl) {
            ScanClassifier.certificateCodeFromPayload(hit.rawValue, siteUrl)
        }
    val action = classification.actionHref
    val actionLabel = classification.actionLabel

    Card(
        modifier = Modifier.fillMaxWidth().testTag(ScanMetrics.RESULT_CARD),
        shape = Recipes.Card.radius,
        colors = CardDefaults.cardColors(containerColor = Recipes.Card.container),
        border = Recipes.Card.border,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(ScanMetrics.cardPadding),
            verticalArrangement = Arrangement.spacedBy(ScanMetrics.resultGap),
        ) {
            Row(
                modifier = Modifier.testTag(ScanMetrics.RESULT_BADGES),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    modifier =
                        Modifier.height(ScanMetrics.resultBadgeHeight)
                            .clip(RoyShape.pill)
                            .background(RoyColors.primary.copy(alpha = 0.1f))
                            .border(1.dp, RoyColors.primary.copy(alpha = 0.3f), RoyShape.pill)
                            .padding(horizontal = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = ScanClassifier.kindLabel(classification.kind),
                        style = type.xs.copy(fontWeight = FontWeight.Bold),
                        color = RoyColors.primary,
                    )
                }
                Text(
                    text = ScanClassifier.formatLabel(hit.format),
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                    modifier =
                        Modifier.height(ScanMetrics.resultBadgeHeight)
                            .border(1.dp, RoyColors.border.copy(alpha = 0.6f), RoyShape.pill)
                            .padding(horizontal = 10.dp)
                            .wrapContentHeight(Alignment.CenterVertically),
                )
            }

            Box(
                modifier =
                    Modifier.fillMaxWidth()
                        .testTag(ScanMetrics.RESULT_PAYLOAD)
                        .heightIn(min = ScanMetrics.resultPayloadMinHeight)
                        .clip(RoundedCornerShape(ScanMetrics.resultPayloadRadius))
                        .background(RoyColors.muted.copy(alpha = 0.4f))
                        .border(
                            1.dp,
                            RoyColors.border.copy(alpha = 0.6f),
                            RoundedCornerShape(ScanMetrics.resultPayloadRadius),
                        )
                        .padding(ScanMetrics.resultPadding),
            ) {
                Text(
                    text = ScanClassifier.truncateForDisplay(classification.value),
                    style =
                        type.xs.copy(
                            lineHeight = 19.5.sp,
                            fontFamily = FontFamily.Monospace,
                            textDirection = TextDirection.Ltr,
                        ),
                    color = RoyColors.foreground,
                )
            }

            classification.host?.let { host ->
                Text(
                    text = "${ScanMessages.DESTINATION} $host",
                    style = type.xs.copy(lineHeight = 16.sp),
                    color = RoyColors.mutedForeground,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            if (classification.deceptive) {
                Notice(ScanMessages.DECEPTIVE, destructive = true)
            }

            classification.refusedScheme?.let { scheme ->
                Notice(ScanMessages.refusedScheme(scheme), destructive = false)
            }

            classification.wifi?.let { wifi ->
                DetailRow(ScanMessages.WIFI_NETWORK, wifi.ssid)
                wifi.password?.let { DetailRow(ScanMessages.WIFI_PASSWORD, it, ltr = true) }
                wifi.encryption?.let { DetailRow(ScanMessages.WIFI_ENCRYPTION, it, ltr = true) }
                if (wifi.hidden) DetailRow(ScanMessages.WIFI_HIDDEN, ScanMessages.YES)
            }

            classification.otp?.let { otp ->
                otp.issuer?.let { DetailRow(ScanMessages.OTP_ISSUER, it) }
                otp.label?.let { DetailRow(ScanMessages.OTP_ACCOUNT, it) }
                DetailRow(ScanMessages.OTP_TYPE, otp.type, ltr = true)
            }

            FlowRow(
                modifier =
                    Modifier.fillMaxWidth().testTag(ScanMetrics.RESULT_ACTIONS),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (action != null && actionLabel != null) {
                    Button(
                        onClick = {
                            if (certificateCode != null) {
                                onOpenRoute("/verify/$certificateCode")
                            } else {
                                onOpenExternal(action)
                            }
                        },
                        modifier = Modifier.height(ScanMetrics.smallButtonHeight),
                        shape = RoyShape.pill,
                        contentPadding = PaddingValues(horizontal = 24.dp),
                    ) {
                        Text(actionLabel, style = type.body.copy(fontWeight = FontWeight.Bold))
                    }
                }
                OutlinedButton(
                    onClick = { onCopy(classification.value) },
                    modifier =
                        Modifier.height(ScanMetrics.smallButtonHeight)
                            .testTag(ScanMetrics.RESULT_COPY),
                    shape = RoyShape.pill,
                    contentPadding = PaddingValues(horizontal = 26.dp),
                ) {
                    Icon(
                        imageVector = LucideVectors.Copy,
                        contentDescription = null,
                        modifier = Modifier.size(Recipes.Glyph.sm),
                    )
                    Text(
                        text = ScanMessages.COPY,
                        style = type.body.copy(fontWeight = FontWeight.Bold),
                        modifier = Modifier.padding(start = 10.dp),
                    )
                }
                TextButton(
                    onClick = onRescan,
                    modifier =
                        Modifier.height(ScanMetrics.smallButtonHeight)
                            .testTag(ScanMetrics.RESULT_RESCAN),
                    contentPadding = PaddingValues(horizontal = 26.dp),
                ) {
                    Icon(
                        imageVector = LucideVectors.RefreshCw,
                        contentDescription = null,
                        modifier = Modifier.size(Recipes.Glyph.sm),
                    )
                    Text(
                        text = ScanMessages.RESCAN,
                        style = type.body.copy(fontWeight = FontWeight.Bold),
                        modifier = Modifier.padding(start = 10.dp),
                    )
                }
            }
        }
    }
}
@Composable
private fun DetailRow(label: String, value: String, ltr: Boolean = false) {
    val type = LocalRoyTypeScale.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = label, style = type.xs, color = RoyColors.mutedForeground)
        Text(
            text = value,
            style =
                type.xs.copy(
                    fontFamily = FontFamily.Monospace,
                    textDirection = if (ltr) TextDirection.Ltr else TextDirection.Rtl,
                ),
            color = RoyColors.foreground,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun Notice(
    text: String,
    destructive: Boolean,
    modifier: Modifier = Modifier,
    icon: Boolean = true,
) {
    val type = LocalRoyTypeScale.current
    val tone = if (destructive) RoyColors.destructive else RoyColors.warning
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(ScanMetrics.noticeRadius))
                .background(tone.copy(alpha = 0.1f))
                .border(
                    1.dp,
                    tone.copy(alpha = 0.3f),
                    RoundedCornerShape(ScanMetrics.noticeRadius),
                )
                .padding(ScanMetrics.noticePadding)
                .semantics { liveRegion = LiveRegionMode.Polite },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        if (icon) {
            Icon(
                imageVector =
                    if (destructive) LucideVectors.TriangleAlert else LucideVectors.ShieldAlert,
                contentDescription = null,
                tint = tone,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
        }
        Text(
            text = text,
            style = type.small.copy(lineHeight = 20.sp),
            color = tone,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/**
 * The live viewfinder. It draws the camera stream into a [TextureView], so the
 * Compose controls above it are ordinary siblings rather than a second surface.
 */
@Composable
private fun CameraPreview(
    controller: MutableState<ScanCameraController?>,
    generation: AtomicInteger,
    onReady: () -> Unit,
    onFailure: () -> Unit,
    onTorchAvailable: (Boolean) -> Unit,
    onFrame: (ByteArray, Int, Int) -> Unit,
) {
    val context = LocalContext.current
    val currentOnReady = rememberUpdatedState(onReady)
    val currentOnFailure = rememberUpdatedState(onFailure)
    val currentOnTorch = rememberUpdatedState(onTorchAvailable)
    val currentOnFrame = rememberUpdatedState(onFrame)
    val rotation = remember(context) { displayRotation(context) }

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { ctx ->
            TextureView(ctx).apply {
                surfaceTextureListener =
                    object : TextureView.SurfaceTextureListener {
                        override fun onSurfaceTextureAvailable(
                            texture: SurfaceTexture,
                            width: Int,
                            height: Int,
                        ) {
                            val token = generation.get()
                            val opened =
                                ScanCameraController(
                                    onFrame = { data, frameWidth, frameHeight ->
                                        if (generation.get() == token) {
                                            currentOnFrame.value(data, frameWidth, frameHeight)
                                        }
                                    },
                                    onReady = {
                                        if (generation.get() == token) currentOnReady.value()
                                    },
                                    onTorchAvailable = {
                                        if (generation.get() == token) currentOnTorch.value(it)
                                    },
                                    onFailure = {
                                        if (generation.get() == token) currentOnFailure.value()
                                    },
                                )
                            controller.value = opened
                            opened.start(texture, rotation)
                        }

                        override fun onSurfaceTextureSizeChanged(
                            texture: SurfaceTexture,
                            width: Int,
                            height: Int,
                        ) = Unit

                        override fun onSurfaceTextureDestroyed(texture: SurfaceTexture): Boolean {
                            generation.incrementAndGet()
                            controller.value?.stop()
                            controller.value = null
                            return true
                        }

                        override fun onSurfaceTextureUpdated(texture: SurfaceTexture) = Unit
                    }
            }
        },
    )
}

/** The system picker's answer, kept apart so "not a picture" and "no code" read differently. */
private sealed interface PictureAnswer {
    data class Found(val hit: ScanHit) : PictureAnswer

    data object NotAnImage : PictureAnswer
}

/** Decodes a chosen picture on the device. No byte of it is ever sent anywhere. */
private fun decodePicture(context: Context, uri: Uri): PictureAnswer? {
    val mime = runCatching { context.contentResolver.getType(uri) }.getOrNull()
    if (mime != null && !mime.startsWith("image/")) return PictureAnswer.NotAnImage

    return runCatching {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, bounds)
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@runCatching null

        var sample = 1
        while (bounds.outWidth / sample > MAX_PICTURE_SIDE ||
            bounds.outHeight / sample > MAX_PICTURE_SIDE
        ) {
            sample *= 2
        }
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        val bitmap =
            context.contentResolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, options)
            } ?: return@runCatching null

        try {
            val pixels = IntArray(bitmap.width * bitmap.height)
            bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
            ScanDecoder.decodePixels(pixels, bitmap.width, bitmap.height)?.let {
                PictureAnswer.Found(it)
            }
        } finally {
            bitmap.recycle()
        }
    }.getOrNull()
}

/** The widest side an uploaded picture is decoded at, as the page caps its frame. */
private const val MAX_PICTURE_SIDE = 2000

@Suppress("DEPRECATION")
private fun displayRotation(context: Context): Int =
    runCatching {
        (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay.rotation
    }
        .getOrDefault(Surface.ROTATION_0)

/** The page's words, in one place until the gate slice pairs the screen. */
internal object ScanMessages {
    const val TITLE = "ماسح QR و Barcode"
    const val START = "تشغيل الكاميرا"
    const val STARTING = "جاري تشغيل الكاميرا…"
    const val STOP = "إيقاف"
    const val SCANNING_HINT = "وجِّه الرَّمز داخل الإطار…"
    const val TORCH_ON = "الكشَّاف"
    const val TORCH_OFF = "إطفاء الكشَّاف"
    const val UPLOAD_HINT = "أو ارفع صورة تحتوي على الرَّمز"
    const val UPLOAD = "اختيار صورة"
    const val READING = "جاري القراءة…"
    const val RESCAN = "مسح رمز آخر"
    const val COPY = "نسخ المحتوى"
    const val DESTINATION = "الوجهة الحقيقيَّة:"
    const val YES = "نعم"
    const val WIFI_NETWORK = "اسم الشَّبكة"
    const val WIFI_PASSWORD = "كلمة المرور"
    const val WIFI_ENCRYPTION = "نوع التَّشفير"
    const val WIFI_HIDDEN = "شبكة مخفيَّة"
    const val OTP_ISSUER = "الجهة"
    const val OTP_ACCOUNT = "الحساب"
    const val OTP_TYPE = "النَّوع"
    const val FIXTURE_PAYLOAD = "royaraqamia.com/scan-fixture"
    const val DECEPTIVE =
        "هذا الرَّابط يخفي وجهته الحقيقيَّة: نطاق مُشابه أو معلومات دخول مضمَّنة. لا تُدخِل عليه أيَّ بيانات."
    const val NO_CAMERA =
        "لا توجد كاميرا مُتاحة على هذا الجهاز. ارفع صورة للرَّمز بدلًا من ذلك."
    const val PERMISSION_DENIED =
        "لم يُسمَح للتَّطبيق بالوصول إلى الكاميرا. فعِّل إذن الكاميرا للتَّطبيق من إعدادات النِّظام، أو ارفع صورة للرَّمز."
    const val CAMERA_FAILED =
        "تعذَّر تشغيل الكاميرا. ارفع صورة للرَّمز بدلًا من ذلك."
    const val NOT_AN_IMAGE = "الملف المختار ليس صورة."
    const val NO_CODE_IN_IMAGE =
        "لم نعثر على رمز في هذه الصُّورة. جرِّب صورة أوضح وأقرب للرَّمز."

    fun refusedScheme(scheme: String): String =
        "الماسح لا يفتح روابط من نوع «$scheme» لأنَّها قد تُنفِّذ أوامر على جهازك."
}
