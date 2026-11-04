package com.royaraqamia.app.leads

import com.royaraqamia.app.store.leads.LeadDraft
import com.royaraqamia.app.store.leads.LeadKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The pages' validation, pinned (#929).
 *
 * The assertions name the contracts' own sentences, because "the app validates
 * like the page" is only true if a rejected field says the same thing on both
 * clients. A changed Zod message is meant to fail this suite.
 */
class LeadValidationTest {
    private val today = "2026-11-04"

    @Test
    fun `a training application checks the name, the phone and the cohort`() {
        val empty = LeadDraft()
        assertEquals(LeadsCopy.ERR_NAME_SHORT, error(LeadKind.Training, LeadField.FullName, empty))
        assertEquals(LeadsCopy.ERR_PHONE, error(LeadKind.Training, LeadField.Phone, empty))
        assertEquals(LeadsCopy.ERR_COHORT_REQUIRED, error(LeadKind.Training, LeadField.Cohort, empty))

        val badPhone = empty.copy(phone = "abc")
        assertEquals(LeadsCopy.ERR_PHONE, error(LeadKind.Training, LeadField.Phone, badPhone))

        val badCohort = empty.copy(cohortId = "not-a-uuid")
        assertEquals(LeadsCopy.ERR_COHORT_INVALID, error(LeadKind.Training, LeadField.Cohort, badCohort))

        val valid =
            LeadDraft(
                fullName = "أحمد العلي",
                phone = "+963 999 123 456",
                cohortId = "11111111-1111-4111-8111-111111111111",
            )
        assertTrue(LeadValidation.errors(LeadKind.Training, valid, today).isEmpty())
    }

    @Test
    fun `the optional training goal keeps the contract's ceiling`() {
        val draft = LeadDraft(goal = "ا".repeat(1001))
        assertEquals(LeadsCopy.ERR_GOAL_LONG, error(LeadKind.Training, LeadField.Goal, draft))
    }

    @Test
    fun `a project request checks the type, the prose, the enums and the url`() {
        val draft = LeadDraft()
        assertEquals(
            LeadsCopy.ERR_PROJECT_TYPE,
            error(LeadKind.ProjectRequest, LeadField.ProjectType, draft),
        )
        assertEquals(
            LeadsCopy.ERR_DESCRIPTION_SHORT,
            error(LeadKind.ProjectRequest, LeadField.Description, draft),
        )
        assertEquals(
            LeadsCopy.ERR_BUDGET,
            error(LeadKind.ProjectRequest, LeadField.BudgetRange, draft.copy(budgetRange = "cheap")),
        )
        assertEquals(
            LeadsCopy.ERR_TIMELINE,
            error(LeadKind.ProjectRequest, LeadField.Timeline, draft.copy(timeline = "soon")),
        )
        assertEquals(
            LeadsCopy.ERR_URL,
            error(LeadKind.ProjectRequest, LeadField.ExistingUrl, draft.copy(existingUrl = "not a url")),
        )
    }

    @Test
    fun `a retainer checks the two prose floors, the date and the email`() {
        val draft = LeadDraft()
        assertEquals(
            LeadsCopy.ERR_PROJECTS_SHORT,
            error(LeadKind.Retainer, LeadField.CurrentProjects, draft),
        )
        assertEquals(LeadsCopy.ERR_NEEDS_SHORT, error(LeadKind.Retainer, LeadField.Needs, draft))
        assertEquals(
            LeadsCopy.ERR_DATE_PAST,
            error(LeadKind.Retainer, LeadField.PreferredStart, draft.copy(preferredStart = "2026-11-03")),
        )
        assertEquals(
            LeadsCopy.ERR_DATE,
            error(LeadKind.Retainer, LeadField.PreferredStart, draft.copy(preferredStart = "2026-02-30")),
        )
        assertEquals(
            LeadsCopy.ERR_EMAIL,
            error(LeadKind.Retainer, LeadField.Email, draft.copy(email = "not-an-email")),
        )
        assertNull(
            "an empty optional email is not an error",
            error(LeadKind.Retainer, LeadField.Email, draft),
        )
    }

    @Test
    fun `a valid retainer passes, including a future start`() {
        val draft =
            LeadDraft(
                fullName = "محمد الحسن",
                phone = "0999999999",
                currentProjects = "متجر إلكتروني قائم على منصة سلة، وأحتاج إلى صيانته وتطويره.",
                needs = "صيانة دورية وإصلاح الأعطال وإضافة ميزات جديدة إلى المتجر الحالي.",
                preferredStart = "2026-11-05",
            )
        assertTrue(LeadValidation.errors(LeadKind.Retainer, draft, today).isEmpty())
    }

    private fun error(kind: LeadKind, field: LeadField, draft: LeadDraft): String? =
        LeadValidation.fieldError(kind, field, draft, today)
}
