package com.royaraqamia.app.leads

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import com.royaraqamia.app.contracts.generated.TrainingCohortsResponseCohortsItem
import com.royaraqamia.app.store.leads.LeadDraft
import com.royaraqamia.app.store.leads.LeadKind
import com.royaraqamia.app.store.leads.LeadSubmitOutcome
import com.royaraqamia.app.store.leads.LeadsRepository
import com.royaraqamia.app.sync.SyncPill
import com.royaraqamia.app.sync.SyncPillState
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The three lead forms as one screen (#929).
 *
 * The page is one wizard per route, and the app draws the same three walks:
 * training's cohort then details, the project request's type then details then
 * contact, the retainer's projects then needs then contact. One screen with a
 * [LeadKind] rather than three near-copies is the same choice the site's shared
 * `FormWizard` makes: the chrome, the validation and the two confirmations are
 * one implementation, and the kind only decides which steps are drawn.
 *
 * The offline behaviour is the page's (ADR-0027, #169): a submission with the
 * radio off is queued in the device's lead Outbox, the form says it is kept
 * rather than sent, and the reference code replaces that sentence when the
 * replay lands. A queued write survives a process kill because the queue is a
 * database row, not screen state.
 *
 * The surface is ported but **switched off** until the visual gate passes
 * (ADR-0117), so the document still opens on top of it.
 */
@Composable
fun LeadsScreen(
    route: String,
    repository: LeadsRepository,
    modifier: Modifier = Modifier,
    onCopy: (String) -> Unit = {},
) {
    val kind = LeadKind.ofRoute(route) ?: return
    val steps = LeadSteps.of(kind)

    var stepIndex by rememberSaveable { mutableIntStateOf(0) }
    var draft by remember { mutableStateOf(LeadDraft()) }
    var errors by remember { mutableStateOf(emptyMap<LeadField, String>()) }
    var submitError by remember { mutableStateOf<String?>(null) }
    var submitting by remember { mutableStateOf(false) }
    var receipt by remember { mutableStateOf<String?>(null) }
    var queued by remember { mutableStateOf(false) }
    var pending by remember { mutableIntStateOf(0) }
    var failed by remember { mutableIntStateOf(0) }
    var cohorts by remember { mutableStateOf(emptyList<TrainingCohortsResponseCohortsItem>()) }
    val scope = rememberCoroutineScope()

    // What this form already reached, and what it still owes, when it opens.
    LaunchedEffect(kind) {
        receipt = repository.receipt(kind)
        queued = kind in repository.pendingKinds()
        val status = repository.outboxStatus()
        pending = status.pending
        failed = status.failed
        if (kind == LeadKind.Training) cohorts = repository.openCohorts()
    }

    // "A queued submission drains when the radio returns" (#929): while a lead
    // is waiting, the form retries on its own and flips to the server's code.
    LaunchedEffect(kind, queued) {
        while (queued) {
            val report = repository.drain()
            receipt = repository.receipt(kind)
            pending = report.pending
            failed = report.failed
            val stillQueued = kind in repository.pendingKinds()
            queued = stillQueued
            if (stillQueued) {
                if (report.failed > 0) break else delay(RETRY_MILLIS)
            }
        }
    }

    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(titleOf(kind), style = MaterialTheme.typography.headlineMedium)

        when {
            receipt != null ->
                LeadSuccessPanel(
                    kind = kind,
                    referenceCode = receipt.orEmpty(),
                    onCopy = onCopy,
                    onStartOver = {
                        scope.launch {
                            repository.dismissReceipt(kind)
                            receipt = null
                            queued = false
                            stepIndex = 0
                            draft = LeadDraft()
                            errors = emptyMap()
                            submitError = null
                        }
                    },
                )
            queued ->
                LeadQueuedPanel(
                    pending = pending,
                    failed = failed,
                    onRetry = {
                        scope.launch {
                            repository.retryFailed()
                            receipt = repository.receipt(kind)
                            queued = kind in repository.pendingKinds()
                        }
                    },
                )
            else -> {
                val step = steps[stepIndex.coerceIn(0, steps.lastIndex)]
                StepIndicator(index = stepIndex, total = steps.size, label = step.label)

                if (kind == LeadKind.Training && step.fields.contains(LeadField.Cohort) &&
                    cohorts.isEmpty()
                ) {
                    Text(LeadsCopy.NO_COHORTS_TITLE, style = MaterialTheme.typography.titleMedium)
                    Text(LeadsCopy.NO_COHORTS_BODY, style = MaterialTheme.typography.bodyMedium)
                }

                step.fields.forEach { field ->
                    LeadFieldInput(
                        kind = kind,
                        field = field,
                        value = valueOf(field, draft),
                        error = errors[field],
                        cohorts = cohorts,
                        onChange = { next ->
                            draft = withValue(draft, field, next)
                            errors = errors - field
                        },
                    )
                }

                submitError?.let {
                    Text(
                        text = it,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
                ) {
                    if (stepIndex > 0) {
                        OutlinedButton(
                            onClick = {
                                submitError = null
                                stepIndex -= 1
                            },
                            enabled = !submitting,
                        ) { Text(LeadsCopy.PREVIOUS) }
                    }

                    val isLast = stepIndex == steps.lastIndex
                    Button(
                        enabled = !submitting,
                        onClick = {
                            val stepErrors =
                                step.fields
                                    .mapNotNull { field ->
                                        LeadValidation.fieldError(kind, field, draft)
                                            ?.let { field to it }
                                    }
                                    .toMap()
                            if (stepErrors.isNotEmpty()) {
                                errors = errors + stepErrors
                                return@Button
                            }
                            errors = emptyMap()
                            submitError = null
                            if (!isLast) {
                                stepIndex += 1
                                return@Button
                            }
                            val all = LeadValidation.errors(kind, draft)
                            if (all.isNotEmpty()) {
                                errors = all
                                val first = steps.indexOfFirst { it.fields.any(all::containsKey) }
                                if (first >= 0) stepIndex = first
                                return@Button
                            }
                            scope.launch {
                                submitting = true
                                when (val outcome = repository.submit(kind, draft)) {
                                    is LeadSubmitOutcome.Sent -> receipt = outcome.referenceCode
                                    LeadSubmitOutcome.Queued -> queued = true
                                    is LeadSubmitOutcome.Failed -> submitError = outcome.message ?: LeadsCopy.GENERIC_ERROR
                                }
                                submitting = false
                            }
                        },
                    ) {
                        Text(
                            when {
                                submitting -> LeadsCopy.SUBMITTING
                                isLast -> submitLabel(kind)
                                else -> LeadsCopy.NEXT
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StepIndicator(index: Int, total: Int, label: String) {
    Text(
        text = "${index + 1} / $total — $label",
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun LeadFieldInput(
    kind: LeadKind,
    field: LeadField,
    value: String,
    error: String?,
    cohorts: List<TrainingCohortsResponseCohortsItem>,
    onChange: (String) -> Unit,
) {
    when (field) {
        LeadField.ProjectType -> ChoiceField(
            label = labelOf(field),
            error = error,
            options =
                listOf(
                    "website" to "${LeadsCopy.TYPE_WEBSITE} (${LeadsCopy.TYPE_WEBSITE_BACKEND})",
                    "app" to "${LeadsCopy.TYPE_APP} (${LeadsCopy.TYPE_APP_BACKEND})",
                ),
            selected = value,
            onSelect = onChange,
        )
        LeadField.Cohort -> CohortField(
            value = value,
            error = error,
            cohorts = cohorts,
            onSelect = onChange,
        )
        LeadField.BudgetRange -> MenuField(
            field = field,
            kind = kind,
            value = value,
            error = error,
            options =
                listOf(
                    "" to LeadsCopy.UNSET,
                    "under-300" to "أقل من $300",
                    "300-600" to "$300 – $600",
                    "600-1200" to "$600 – $1,200",
                    "over-1200" to "أكثر من $1,200",
                ),
            onSelect = onChange,
        )
        LeadField.Timeline -> MenuField(
            field = field,
            kind = kind,
            value = value,
            error = error,
            options =
                listOf(
                    "" to LeadsCopy.UNSET,
                    "within-a-month" to "خلال شهر",
                    "one-to-three-months" to "شهر – ثلاثة أشهر",
                    "three-to-six-months" to "ثلاثة أشهر - ستَّة أشهر",
                    "flexible" to "مرن",
                ),
            onSelect = onChange,
        )
        else ->
            OutlinedTextField(
                value = value,
                onValueChange = { next -> onChange(next.take(maxLengthOf(field))) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text(labelOf(field)) },
                placeholder = { Text(placeholderOf(field, kind)) },
                singleLine = field !in TEXTAREAS,
                minLines = if (field in TEXTAREAS) 4 else 1,
                maxLines = if (field in TEXTAREAS) 8 else 1,
                isError = error != null,
                supportingText = {
                    val help = error ?: helpOf(field, kind)
                    if (!help.isNullOrBlank()) Text(help)
                },
                keyboardOptions = KeyboardOptions(keyboardType = keyboardOf(field)),
            )
    }
}

@Composable
private fun ChoiceField(
    label: String,
    error: String?,
    options: List<Pair<String, String>>,
    selected: String,
    onSelect: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge)
        Column(Modifier.selectableGroup()) {
            options.forEach { (value, text) ->
                Row(
                    modifier =
                        Modifier.fillMaxWidth()
                            .selectable(selected = selected == value, onClick = { onSelect(value) })
                            .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = selected == value, onClick = { onSelect(value) })
                    Text(text, modifier = Modifier.padding(start = 8.dp))
                }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}

@Composable
private fun CohortField(
    value: String,
    error: String?,
    cohorts: List<TrainingCohortsResponseCohortsItem>,
    onSelect: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(LeadsCopy.CHOOSE_COHORT, style = MaterialTheme.typography.labelLarge)
        Text(LeadsCopy.COHORT_INTRO, style = MaterialTheme.typography.bodySmall)
        Column(Modifier.selectableGroup()) {
            cohorts.forEach { cohort ->
                val seats = maxOf(cohort.capacity - cohort.seats_taken, 0L)
                val full = seats == 0L
                Row(
                    modifier =
                        Modifier.fillMaxWidth()
                            .selectable(
                                selected = value == cohort.id,
                                enabled = !full,
                                onClick = { onSelect(cohort.id) },
                            )
                            .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(
                        selected = value == cohort.id,
                        onClick = { onSelect(cohort.id) },
                        enabled = !full,
                    )
                    Column(Modifier.padding(start = 8.dp)) {
                        Text(cohort.label)
                        Text(
                            text =
                                if (full) LeadsCopy.SEATS_FULL
                                else LeadsCopy.SEATS_LEFT.replace("{count}", seats.toString()),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}

@Composable
private fun MenuField(
    field: LeadField,
    kind: LeadKind,
    value: String,
    error: String?,
    options: List<Pair<String, String>>,
    onSelect: (String) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    val selected = options.firstOrNull { it.first == value }?.second ?: LeadsCopy.UNSET
    Column {
        OutlinedTextField(
            value = selected,
            onValueChange = {},
            modifier = Modifier.fillMaxWidth(),
            readOnly = true,
            label = { Text(labelOf(field)) },
            isError = error != null,
            supportingText = { error?.let { Text(it) } },
            trailingIcon = {
                TextButton(onClick = { open = true }) { Text("▾") }
            },
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { (optionValue, text) ->
                DropdownMenuItem(
                    text = { Text(text) },
                    onClick = {
                        open = false
                        onSelect(optionValue)
                    },
                )
            }
        }
    }
}

@Composable
private fun LeadQueuedPanel(pending: Int, failed: Int, onRetry: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(LeadsCopy.QUEUED_TITLE, style = MaterialTheme.typography.titleLarge)
            Text(LeadsCopy.QUEUED_BODY, style = MaterialTheme.typography.bodyMedium)
            val state =
                when {
                    failed > 0 -> SyncPillState.Failed(failed)
                    pending > 0 -> SyncPillState.Pending(pending)
                    else -> SyncPillState.Offline(0)
                }
            SyncPill(state = state, onRetry = if (failed > 0) onRetry else null)
        }
    }
}

@Composable
private fun LeadSuccessPanel(
    kind: LeadKind,
    referenceCode: String,
    onCopy: (String) -> Unit,
    onStartOver: () -> Unit,
) {
    var copied by remember { mutableStateOf(false) }

    Card(Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(LeadsCopy.SUCCESS_TITLE, style = MaterialTheme.typography.titleLarge)
            Text(successMessageOf(kind), style = MaterialTheme.typography.bodyMedium)
            Text(LeadsCopy.REFERENCE_LABEL, style = MaterialTheme.typography.labelMedium)
            Text(referenceCode, style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(
                    onClick = {
                        onCopy(referenceCode)
                        copied = true
                    }
                ) { Text(if (copied) LeadsCopy.COPIED else LeadsCopy.COPY) }
                TextButton(onClick = onStartOver) { Text(LeadsCopy.START_OVER) }
            }
        }
    }
}

private fun titleOf(kind: LeadKind): String = when (kind) {
    LeadKind.Training -> LeadsCopy.TRAINING_TITLE
    LeadKind.ProjectRequest -> LeadsCopy.PROJECT_TITLE
    LeadKind.Retainer -> LeadsCopy.RETAINER_TITLE
}

private fun submitLabel(kind: LeadKind): String = when (kind) {
    LeadKind.Training -> LeadsCopy.SUBMIT_TRAINING
    LeadKind.ProjectRequest -> LeadsCopy.SUBMIT_PROJECT
    LeadKind.Retainer -> LeadsCopy.SUBMIT_RETAINER
}

private fun successMessageOf(kind: LeadKind): String = when (kind) {
    LeadKind.Training -> LeadsCopy.SUCCESS_TRAINING
    LeadKind.ProjectRequest -> LeadsCopy.SUCCESS_PROJECT
    LeadKind.Retainer -> LeadsCopy.SUCCESS_RETAINER
}

private fun labelOf(field: LeadField): String = when (field) {
    LeadField.FullName -> LeadsCopy.FULL_NAME
    LeadField.Phone -> LeadsCopy.PHONE
    LeadField.Email -> LeadsCopy.EMAIL
    LeadField.Goal -> LeadsCopy.GOAL
    LeadField.Cohort -> LeadsCopy.CHOOSE_COHORT
    LeadField.ProjectType -> LeadsCopy.PROJECT_STEP_TYPE
    LeadField.Description -> LeadsCopy.DESCRIPTION
    LeadField.BudgetRange -> LeadsCopy.BUDGET_RANGE
    LeadField.Timeline -> LeadsCopy.TIMELINE
    LeadField.ExistingUrl -> LeadsCopy.EXISTING_URL
    LeadField.Company -> LeadsCopy.COMPANY
    LeadField.CurrentProjects -> LeadsCopy.CURRENT_PROJECTS
    LeadField.Needs -> LeadsCopy.NEEDS
    LeadField.PreferredStart -> LeadsCopy.PREFERRED_START
}

private fun placeholderOf(field: LeadField, kind: LeadKind): String = when (field) {
    LeadField.FullName ->
        if (kind == LeadKind.Retainer) LeadsCopy.FULL_NAME_PLACEHOLDER_RETAINER
        else LeadsCopy.FULL_NAME_PLACEHOLDER
    LeadField.Phone -> LeadsCopy.PHONE_PLACEHOLDER
    LeadField.Email -> LeadsCopy.EMAIL_PLACEHOLDER
    LeadField.Goal -> LeadsCopy.GOAL_PLACEHOLDER
    LeadField.Description -> LeadsCopy.DESCRIPTION_PLACEHOLDER
    LeadField.ExistingUrl -> LeadsCopy.EXISTING_URL_PLACEHOLDER
    LeadField.Company -> LeadsCopy.COMPANY_PLACEHOLDER
    LeadField.CurrentProjects -> LeadsCopy.CURRENT_PROJECTS_PLACEHOLDER
    LeadField.Needs -> LeadsCopy.NEEDS_PLACEHOLDER
    LeadField.PreferredStart -> LeadsCopy.PREFERRED_START_PLACEHOLDER
    else -> ""
}

private fun helpOf(field: LeadField, kind: LeadKind): String? = when (field) {
    LeadField.Phone ->
        if (kind == LeadKind.Retainer) LeadsCopy.PHONE_HELP_RETAINER else LeadsCopy.PHONE_HELP
    else -> null
}

private fun keyboardOf(field: LeadField): KeyboardType = when (field) {
    LeadField.Phone -> KeyboardType.Phone
    LeadField.Email -> KeyboardType.Email
    LeadField.ExistingUrl -> KeyboardType.Uri
    else -> KeyboardType.Text
}

private fun maxLengthOf(field: LeadField): Int = when (field) {
    LeadField.FullName -> 120
    LeadField.Phone -> 20
    LeadField.Email -> 200
    LeadField.Goal -> 1000
    LeadField.Description -> 2000
    LeadField.ExistingUrl -> 500
    LeadField.Company -> 120
    LeadField.CurrentProjects -> 2000
    LeadField.Needs -> 2000
    LeadField.PreferredStart -> 10
    else -> 200
}

private fun valueOf(field: LeadField, draft: LeadDraft): String = when (field) {
    LeadField.FullName -> draft.fullName
    LeadField.Phone -> draft.phone
    LeadField.Email -> draft.email
    LeadField.Goal -> draft.goal
    LeadField.Cohort -> draft.cohortId
    LeadField.ProjectType -> draft.projectType
    LeadField.Description -> draft.description
    LeadField.BudgetRange -> draft.budgetRange
    LeadField.Timeline -> draft.timeline
    LeadField.ExistingUrl -> draft.existingUrl
    LeadField.Company -> draft.company
    LeadField.CurrentProjects -> draft.currentProjects
    LeadField.Needs -> draft.needs
    LeadField.PreferredStart -> draft.preferredStart
}

private fun withValue(draft: LeadDraft, field: LeadField, value: String): LeadDraft = when (field) {
    LeadField.FullName -> draft.copy(fullName = value)
    LeadField.Phone -> draft.copy(phone = value)
    LeadField.Email -> draft.copy(email = value)
    LeadField.Goal -> draft.copy(goal = value)
    LeadField.Cohort -> draft.copy(cohortId = value)
    LeadField.ProjectType -> draft.copy(projectType = value)
    LeadField.Description -> draft.copy(description = value)
    LeadField.BudgetRange -> draft.copy(budgetRange = value)
    LeadField.Timeline -> draft.copy(timeline = value)
    LeadField.ExistingUrl -> draft.copy(existingUrl = value)
    LeadField.Company -> draft.copy(company = value)
    LeadField.CurrentProjects -> draft.copy(currentProjects = value)
    LeadField.Needs -> draft.copy(needs = value)
    LeadField.PreferredStart -> draft.copy(preferredStart = value)
}

private val TEXTAREAS =
    setOf(
        LeadField.Goal,
        LeadField.Description,
        LeadField.CurrentProjects,
        LeadField.Needs,
    )

private const val RETRY_MILLIS = 5_000L
