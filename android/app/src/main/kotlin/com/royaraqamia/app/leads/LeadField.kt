package com.royaraqamia.app.leads

import com.royaraqamia.app.store.leads.LeadKind

/**
 * One answer on a lead form (#929).
 *
 * The same list serves the screen, the step specs and the validator, so a field
 * cannot be drawn without a rule or validated without being drawn.
 */
enum class LeadField {
    FullName,
    Phone,
    Email,
    Goal,
    Cohort,
    ProjectType,
    Description,
    BudgetRange,
    Timeline,
    ExistingUrl,
    Company,
    CurrentProjects,
    Needs,
    PreferredStart,
    ;

    companion object {
        /** The fields a form actually draws; the other kinds' answers never reach its body. */
        fun of(kind: LeadKind): List<LeadField> = when (kind) {
            LeadKind.Training -> listOf(FullName, Phone, Goal, Cohort)
            LeadKind.ProjectRequest ->
                listOf(
                    FullName,
                    Phone,
                    Email,
                    ProjectType,
                    Description,
                    BudgetRange,
                    Timeline,
                    ExistingUrl,
                )
            LeadKind.Retainer ->
                listOf(FullName, Phone, Email, Company, CurrentProjects, Needs, PreferredStart)
        }
    }
}

/** One step of a form: the page's own step label and the fields under it. */
data class LeadStep(val label: String, val fields: List<LeadField>)

/**
 * The page's steps, in the same order (#929).
 *
 * Training is the page's two steps; the project request and the retainer are
 * three. The labels are the site's, so a visitor who starts a form in the
 * document and finishes it in the app sees the same walk.
 */
object LeadSteps {
    fun of(kind: LeadKind): List<LeadStep> = when (kind) {
        LeadKind.Training ->
            listOf(
                LeadStep(LeadsCopy.TRAINING_STEP_COHORT, listOf(LeadField.Cohort)),
                LeadStep(
                    LeadsCopy.STEP_DETAILS,
                    listOf(LeadField.FullName, LeadField.Phone, LeadField.Goal),
                ),
            )
        LeadKind.ProjectRequest ->
            listOf(
                LeadStep(LeadsCopy.PROJECT_STEP_TYPE, listOf(LeadField.ProjectType)),
                LeadStep(
                    LeadsCopy.PROJECT_STEP_DETAILS,
                    listOf(
                        LeadField.Description,
                        LeadField.BudgetRange,
                        LeadField.Timeline,
                        LeadField.ExistingUrl,
                    ),
                ),
                LeadStep(
                    LeadsCopy.STEP_CONTACT,
                    listOf(LeadField.FullName, LeadField.Phone, LeadField.Email),
                ),
            )
        LeadKind.Retainer ->
            listOf(
                LeadStep(
                    LeadsCopy.RETAINER_STEP_PROJECTS,
                    listOf(LeadField.Company, LeadField.CurrentProjects),
                ),
                LeadStep(
                    LeadsCopy.RETAINER_STEP_NEEDS,
                    listOf(LeadField.Needs, LeadField.PreferredStart),
                ),
                LeadStep(
                    LeadsCopy.STEP_CONTACT,
                    listOf(LeadField.FullName, LeadField.Phone, LeadField.Email),
                ),
            )
    }
}
