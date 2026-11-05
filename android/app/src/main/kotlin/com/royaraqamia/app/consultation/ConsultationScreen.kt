package com.royaraqamia.app.consultation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.AvailabilitySlotsResponseSlotsItem
import com.royaraqamia.app.contracts.generated.ConsultationPackagesResponsePackagesItem
import com.royaraqamia.app.plans.PlanMoney
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.roundToLong

/**
 * `/consultation/book` as a screen (#930).
 *
 * Booking reserves a live availability slot, so the screen is deliberately not a
 * form that queues: the packages and the calendar are read on arrival, the
 * confirmation sends one request, and with no radio it offers no write at all
 * (ADR-0031). A slot taken between the read and the write is the server's `409`;
 * the screen keeps the server's sentence and reads the calendar again instead of
 * promising a slot it no longer holds.
 *
 * The surface is ported but switched off until the visual gate pairs it with the
 * page (ADR-0117), so the document still opens on top of it.
 */
@Composable
fun ConsultationScreen(
    repository: ConsultationRepository,
    onCopy: (String) -> Unit,
    modifier: Modifier = Modifier,
    online: Boolean = repository.isOnline(),
) {
    ConsultationScreen(
        loadPackages = repository::packages,
        loadSlots = repository::slots,
        book = repository::book,
        online = online,
        onCopy = onCopy,
        modifier = modifier,
    )
}

@Composable
internal fun ConsultationScreen(
    loadPackages: suspend () -> ApiResult<List<ConsultationPackagesResponsePackagesItem>>,
    loadSlots: suspend () -> ApiResult<List<AvailabilitySlotsResponseSlotsItem>>,
    book: suspend (ConsultationDraft) -> BookingAttempt,
    online: Boolean,
    onCopy: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var stepIndex by remember { mutableIntStateOf(0) }
    var packages by remember { mutableStateOf(emptyList<ConsultationPackagesResponsePackagesItem>()) }
    var packagesLoading by remember { mutableStateOf(true) }
    var packagesError by remember { mutableStateOf<String?>(null) }
    var slots by remember { mutableStateOf(emptyList<AvailabilitySlotsResponseSlotsItem>()) }
    var slotsLoading by remember { mutableStateOf(false) }
    var slotsError by remember { mutableStateOf<String?>(null) }
    var draft by remember { mutableStateOf(ConsultationDraft()) }
    var fieldErrors by remember { mutableStateOf(emptyMap<ConsultationField, String>()) }
    var submitError by remember { mutableStateOf<String?>(null) }
    var submitting by remember { mutableStateOf(false) }
    var receipt by remember { mutableStateOf<String?>(null) }
    var copied by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val selectedPackage = packages.firstOrNull { it.id == draft.packageId }
    val requiredSessions = max(1, selectedPackage?.sessions_count?.toInt() ?: 1)
    val selectedSlots = draft.slotIds.size

    suspend fun readPackages() {
        if (!online) {
            packagesError = ConsultationCopy.PACKAGES_ERROR
            packagesLoading = false
            return
        }
        packagesLoading = true
        when (val answer = loadPackages()) {
            is ApiResult.Success -> {
                packages = answer.value
                packagesError = null
            }
            is ApiResult.Failure -> packagesError = ConsultationCopy.PACKAGES_ERROR
        }
        packagesLoading = false
    }

    suspend fun readSlots() {
        if (!online) {
            slotsError = ConsultationCopy.SLOTS_ERROR
            slotsLoading = false
            return
        }
        slotsLoading = true
        when (val answer = loadSlots()) {
            is ApiResult.Success -> {
                slots = answer.value
                slotsError = null
                val available = answer.value.map { it.id }.toSet()
                draft = draft.copy(slotIds = draft.slotIds.filter { it in available })
            }
            is ApiResult.Failure -> slotsError = ConsultationCopy.SLOTS_ERROR
        }
        slotsLoading = false
    }

    LaunchedEffect(Unit) { readPackages() }

    LaunchedEffect(copied) {
        if (!copied) return@LaunchedEffect
        delay(COPIED_MARK_MS)
        copied = false
    }

    fun confirm() {
        val contactErrors = ConsultationValidation.errors(draft)
        if (contactErrors.isNotEmpty()) {
            fieldErrors = contactErrors
            stepIndex = DETAILS_STEP
            return
        }
        if (draft.packageId.isBlank()) {
            submitError = ConsultationCopy.ERR_PACKAGE
            stepIndex = PACKAGE_STEP
            return
        }
        if (draft.slotIds.size != requiredSessions) {
            submitError = ConsultationCopy.ERR_SLOT_COUNT
            stepIndex = SLOTS_STEP
            return
        }
        submitError = null
        fieldErrors = emptyMap()
        scope.launch {
            submitting = true
            when (val outcome = book(draft)) {
                is BookingAttempt.Confirmed -> receipt = outcome.referenceCode
                is BookingAttempt.Taken -> {
                    submitError = outcome.message
                    stepIndex = SLOTS_STEP
                    readSlots()
                }
                is BookingAttempt.Refused -> submitError = outcome.message
                is BookingAttempt.Unreachable -> submitError = outcome.message
                BookingAttempt.Offline -> submitError = ConsultationCopy.OFFLINE_SUBMIT
            }
            submitting = false
        }
    }

    val canProceed =
        when (stepIndex) {
            PACKAGE_STEP -> selectedPackage != null
            SLOTS_STEP -> !slotsLoading && selectedSlots == requiredSessions
            else ->
                draft.fullName.trim().length > 1 &&
                    draft.phone.trim().length > 5 &&
                    draft.topic.trim().length >= ConsultationValidation.TOPIC_MIN
        }

    val shownReceipt = receipt
    if (shownReceipt != null) {
        SuccessPanel(
            referenceCode = shownReceipt,
            copied = copied,
            onCopy = {
                onCopy(it)
                copied = true
            },
            onStartOver = {
                receipt = null
                stepIndex = PACKAGE_STEP
                draft = ConsultationDraft()
                fieldErrors = emptyMap()
                submitError = null
                slots = emptyList()
                slotsError = null
                packagesError = null
            },
        )
        return
    }

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = ConsultationCopy.PAGE_TITLE,
            modifier = Modifier.testTag(ConsultationTags.TITLE).fillMaxWidth(),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.ExtraBold,
            textAlign = TextAlign.Center,
        )

        if (!online) OfflineBanner()

        Card(
            modifier = Modifier.testTag(ConsultationTags.WIZARD).fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                StepIndicator(stepIndex)

                when (stepIndex) {
                    PACKAGE_STEP ->
                        PackageStep(
                            packages = packages,
                            loading = packagesLoading,
                            error = packagesError,
                            selectedId = draft.packageId,
                            onSelect = { id ->
                                draft = draft.copy(packageId = id, slotIds = emptyList())
                                slots = emptyList()
                                slotsError = null
                                submitError = null
                            },
                            onRetry = { scope.launch { readPackages() } },
                        )
                    SLOTS_STEP ->
                        SlotsStep(
                            slots = slots,
                            loading = slotsLoading,
                            error = slotsError,
                            selectedIds = draft.slotIds,
                            required = requiredSessions,
                            onToggle = { id ->
                                val current = draft.slotIds
                                val next =
                                    if (id in current) current - id
                                    else if (current.size >= requiredSessions) current
                                    else current + id
                                draft = draft.copy(slotIds = next)
                                submitError = null
                            },
                            onRetry = { scope.launch { readSlots() } },
                        )
                    else ->
                        DetailsStep(
                            draft = draft,
                            errors = fieldErrors,
                            onChange = { next ->
                                draft = next
                                fieldErrors =
                                    fieldErrors.filterKeys { field ->
                                        ConsultationValidation.fieldError(field, next) != null
                                    }
                            },
                        )
                }

                submitError?.let {
                    Text(
                        text = it,
                        modifier = Modifier.testTag(ConsultationTags.ERROR).fillMaxWidth(),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (stepIndex > 0) {
                        OutlinedButton(
                            onClick = {
                                submitError = null
                                stepIndex -= 1
                            },
                            enabled = !submitting,
                        ) { Text(ConsultationCopy.PREVIOUS) }
                    }

                    Button(
                        modifier = Modifier.testTag(ConsultationTags.NEXT),
                        enabled = !submitting && canProceed && online,
                        onClick = {
                            submitError = null
                            when (stepIndex) {
                                PACKAGE_STEP -> {
                                    stepIndex = SLOTS_STEP
                                    scope.launch { readSlots() }
                                }
                                SLOTS_STEP -> stepIndex = DETAILS_STEP
                                else -> confirm()
                            }
                        },
                    ) {
                        Text(
                            when {
                                submitting -> ConsultationCopy.SUBMITTING
                                stepIndex == DETAILS_STEP -> ConsultationCopy.CONFIRM
                                else -> ConsultationCopy.NEXT
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun OfflineBanner() {
    Card(
        modifier = Modifier.testTag(ConsultationTags.OFFLINE).fillMaxWidth(),
        colors =
            CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.secondaryContainer,
            ),
    ) {
        Text(
            text = ConsultationCopy.OFFLINE_BANNER,
            modifier = Modifier.padding(16.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSecondaryContainer,
        )
    }
}

@Composable
private fun StepIndicator(index: Int) {
    val labels = listOf(ConsultationCopy.STEP_PACKAGE, ConsultationCopy.STEP_SLOTS, ConsultationCopy.STEP_DETAILS)
    Text(
        text = "${index + 1} / ${labels.size} — ${labels[index]}",
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun PackageStep(
    packages: List<ConsultationPackagesResponsePackagesItem>,
    loading: Boolean,
    error: String?,
    selectedId: String,
    onSelect: (String) -> Unit,
    onRetry: () -> Unit,
) {
    when {
        loading ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator()
                Text(ConsultationCopy.PACKAGES_LOADING)
            }
        packages.isEmpty() && error != null ->
            FailureBlock(message = error, onRetry = onRetry)
        packages.isEmpty() ->
            Text(
                text = ConsultationCopy.PACKAGES_EMPTY,
                modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        else ->
            Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                packages.forEach { pkg ->
                    val selected = pkg.id == selectedId
                    Card(
                        modifier =
                            Modifier.testTag(ConsultationTags.packageTag(pkg.id))
                                .fillMaxWidth()
                                .selectable(selected = selected, onClick = { onSelect(pkg.id) }),
                        colors =
                            CardDefaults.cardColors(
                                containerColor =
                                    if (selected) MaterialTheme.colorScheme.primaryContainer
                                    else MaterialTheme.colorScheme.surfaceVariant,
                            ),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(16.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            RadioButton(selected = selected, onClick = { onSelect(pkg.id) })
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Text(pkg.name, style = MaterialTheme.typography.titleMedium)
                                pkg.description?.let {
                                    Text(
                                        text = it,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Text(
                                    text =
                                        PlanMoney.label(
                                            (pkg.price_usd * 100).roundToLong(),
                                            "USD",
                                        ),
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.Black,
                                )
                                Text(
                                    text =
                                        ConsultationCopy.minutesLabel(
                                            pkg.duration_minutes.toLong()
                                        ),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
    }
}

@Composable
private fun SlotsStep(
    slots: List<AvailabilitySlotsResponseSlotsItem>,
    loading: Boolean,
    error: String?,
    selectedIds: List<String>,
    required: Int,
    onToggle: (String) -> Unit,
    onRetry: () -> Unit,
) {
    when {
        loading ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator()
                Text(ConsultationCopy.SLOTS_LOADING)
            }
        slots.isEmpty() && error != null ->
            FailureBlock(message = error, onRetry = onRetry)
        slots.isEmpty() ->
            Column(
                modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = ConsultationCopy.SLOTS_EMPTY_TITLE,
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    text = ConsultationCopy.SLOTS_EMPTY_BODY,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        else ->
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (error != null) {
                    Text(
                        text = ConsultationCopy.SLOTS_STALE,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    text =
                        ConsultationCopy.slotCountProgress(
                            selected = selectedIds.size,
                            required = required,
                        ),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )

                val grouped = slots.groupBy { ConsultationTime.dayKey(it.starts_at) }
                grouped.forEach { (_, daySlots) ->
                    val first = daySlots.firstOrNull() ?: return@forEach
                    Text(
                        text = ConsultationTime.dateLabel(first.starts_at),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        daySlots.forEach { slot ->
                            val selected = slot.id in selectedIds
                            val disabled = !selected && selectedIds.size >= required
                            Surface(
                                modifier =
                                    Modifier.testTag(ConsultationTags.slot(slot.id))
                                        .fillMaxWidth(),
                                onClick = { onToggle(slot.id) },
                                enabled = !disabled,
                                shape = MaterialTheme.shapes.medium,
                                color =
                                    if (selected) MaterialTheme.colorScheme.primary
                                    else MaterialTheme.colorScheme.surfaceVariant,
                            ) {
                                Column(Modifier.padding(12.dp)) {
                                    Text(
                                        text = ConsultationTime.range(slot),
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Bold,
                                        color =
                                            if (selected) MaterialTheme.colorScheme.onPrimary
                                            else MaterialTheme.colorScheme.onSurface,
                                    )
                                    ConsultationTime.damascusHint(slot)?.let { hint ->
                                        Text(
                                            text = ConsultationCopy.DAMASCUS_PREFIX + hint,
                                            style = MaterialTheme.typography.bodySmall,
                                            color =
                                                if (selected)
                                                    MaterialTheme.colorScheme.onPrimary.copy(
                                                        alpha = 0.8f
                                                    )
                                                else MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
    }
}

@Composable
private fun DetailsStep(
    draft: ConsultationDraft,
    errors: Map<ConsultationField, String>,
    onChange: (ConsultationDraft) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        OutlinedTextField(
            value = draft.fullName,
            onValueChange = { onChange(draft.copy(fullName = it.take(120))) },
            modifier = Modifier.testTag(ConsultationTags.NAME).fillMaxWidth(),
            label = { Text(ConsultationCopy.NAME) },
            placeholder = { Text(ConsultationCopy.NAME_PLACEHOLDER) },
            singleLine = true,
            isError = errors[ConsultationField.FullName] != null,
            supportingText = { errors[ConsultationField.FullName]?.let { Text(it) } },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
        )

        OutlinedTextField(
            value = draft.phone,
            onValueChange = {
                onChange(
                    draft.copy(
                        phone = ConsultationValidation.toLatinDigits(it).take(20)
                    )
                )
            },
            modifier = Modifier.testTag(ConsultationTags.PHONE).fillMaxWidth(),
            label = { Text(ConsultationCopy.PHONE) },
            placeholder = { Text(ConsultationCopy.PHONE_PLACEHOLDER) },
            singleLine = true,
            isError = errors[ConsultationField.Phone] != null,
            supportingText = { errors[ConsultationField.Phone]?.let { Text(it) } },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
        )

        OutlinedTextField(
            value = draft.topic,
            onValueChange = { onChange(draft.copy(topic = it.take(ConsultationValidation.TOPIC_MAX))) },
            modifier = Modifier.testTag(ConsultationTags.TOPIC).fillMaxWidth(),
            label = { Text(ConsultationCopy.TOPIC) },
            placeholder = { Text(ConsultationCopy.TOPIC_PLACEHOLDER) },
            minLines = 4,
            maxLines = 8,
            isError = errors[ConsultationField.Topic] != null,
            supportingText = {
                Text(errors[ConsultationField.Topic] ?: ConsultationCopy.TOPIC_HINT)
            },
        )
    }
}

@Composable
private fun FailureBlock(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        OutlinedButton(onClick = onRetry) { Text(ConsultationCopy.RETRY) }
    }
}

@Composable
private fun SuccessPanel(
    referenceCode: String,
    copied: Boolean,
    onCopy: (String) -> Unit,
    onStartOver: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = ConsultationCopy.SUCCESS_TITLE,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.ExtraBold,
            textAlign = TextAlign.Center,
        )
        Text(
            text = ConsultationCopy.SUCCESS_MESSAGE,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Card(Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = ConsultationCopy.REFERENCE_LABEL,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = referenceCode,
                    modifier = Modifier.testTag(ConsultationTags.RECEIPT),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(onClick = { onCopy(referenceCode) }) {
                Text(if (copied) ConsultationCopy.COPIED else ConsultationCopy.COPY)
            }
            TextButton(onClick = onStartOver) { Text(ConsultationCopy.START_OVER) }
        }
    }
}

internal object ConsultationTags {
    const val TITLE = "consultation-title"
    const val WIZARD = "consultation-wizard"
    const val NEXT = "consultation-next"
    const val OFFLINE = "consultation-offline"
    const val NAME = "consultation-name"
    const val PHONE = "consultation-phone"
    const val TOPIC = "consultation-topic"
    const val ERROR = "consultation-error"
    const val RECEIPT = "consultation-receipt"

    fun packageTag(id: String): String = "consultation-package-$id"

    fun slot(id: String): String = "consultation-slot-$id"
}

private const val PACKAGE_STEP = 0
private const val SLOTS_STEP = 1
private const val DETAILS_STEP = 2
private const val COPIED_MARK_MS = 2_000L

