package com.royaraqamia.app.consultation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The booking page's rules, in the app (#930).
 *
 * The sentences are the shared Zod schema's own, so a rejected field says the
 * same thing on both clients and a submission the app accepts is one the server
 * accepts.
 */
class ConsultationValidationTest {
    private val valid =
        ConsultationDraft(
            fullName = "أحمد",
            phone = "+963968478904",
            topic = "أ".repeat(ConsultationValidation.TOPIC_MIN),
        )

    @Test
    fun `a complete form has no errors`() {
        assertEquals(emptyMap<ConsultationField, String>(), ConsultationValidation.errors(valid))
    }

    @Test
    fun `the name floor and ceiling are the schema's`() {
        assertEquals(
            ConsultationCopy.ERR_NAME_SHORT,
            ConsultationValidation.fieldError(
                ConsultationField.FullName,
                valid.copy(fullName = "أ"),
            ),
        )
        assertEquals(
            ConsultationCopy.ERR_NAME_LONG,
            ConsultationValidation.fieldError(
                ConsultationField.FullName,
                valid.copy(fullName = "أ".repeat(121)),
            ),
        )
    }

    @Test
    fun `the phone keeps the page's permissive shape`() {
        assertNull(
            ConsultationValidation.fieldError(
                ConsultationField.Phone,
                valid.copy(phone = "+963 968 478 904"),
            )
        )
        assertEquals(
            ConsultationCopy.ERR_PHONE,
            ConsultationValidation.fieldError(
                ConsultationField.Phone,
                valid.copy(phone = "abc"),
            ),
        )
    }

    @Test
    fun `Arabic-Indic digits in a phone are normalised before they are judged`() {
        assertNull(
            ConsultationValidation.fieldError(
                ConsultationField.Phone,
                valid.copy(phone = "+963\u0669\u0666\u0668\u0664\u0667\u0668\u0669\u0660\u0664"),
            )
        )
        assertEquals(
            "+963968478904",
            ConsultationValidation.toLatinDigits("+963\u0669\u0666\u0668\u0664\u0667\u0668\u0669\u0660\u0664"),
        )
    }

    @Test
    fun `the topic is measured after trimming`() {
        assertEquals(
            ConsultationCopy.ERR_TOPIC_SHORT,
            ConsultationValidation.fieldError(
                ConsultationField.Topic,
                valid.copy(topic = "  ${"أ".repeat(ConsultationValidation.TOPIC_MIN - 1)}  "),
            ),
        )
        assertEquals(
            ConsultationCopy.ERR_TOPIC_LONG,
            ConsultationValidation.fieldError(
                ConsultationField.Topic,
                valid.copy(topic = "أ".repeat(ConsultationValidation.TOPIC_MAX + 1)),
            ),
        )
    }

    @Test
    fun `a package and the required slot count are gates, not field errors`() {
        assertEquals(ConsultationCopy.ERR_PACKAGE, ConsultationValidation.packageError(""))
        assertNull(ConsultationValidation.packageError("p-1"))
        assertEquals(ConsultationCopy.ERR_SLOT_COUNT, ConsultationValidation.slotError(1, 2))
        assertNull(ConsultationValidation.slotError(2, 2))
    }
}
