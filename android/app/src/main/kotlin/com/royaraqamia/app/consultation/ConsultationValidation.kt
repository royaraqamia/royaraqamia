package com.royaraqamia.app.consultation

/**
 * The booking page's validation, in the app (#930).
 *
 * The rules and the sentences are the shared Zod schema's own (`BookingContactSchema`),
 * so a submission the app accepts is one the server accepts, and a refused field
 * says to an app visitor what it says on the page. Package and slot count are the
 * wizard's gates on the page too, not new rules invented here.
 */
object ConsultationValidation {
    const val TOPIC_MIN = 30
    const val TOPIC_MAX = 2000

    private val PHONE = Regex("""^[+]?[\d\s-]{7,20}$""")

    fun errors(draft: ConsultationDraft): Map<ConsultationField, String> =
        ConsultationField.entries
            .mapNotNull { field ->
                fieldError(field, draft)?.let { field to it }
            }
            .toMap()

    fun fieldError(field: ConsultationField, draft: ConsultationDraft): String? {
        val value =
            when (field) {
                ConsultationField.FullName -> draft.fullName.trim()
                ConsultationField.Phone -> toLatinDigits(draft.phone.trim())
                ConsultationField.Topic -> draft.topic.trim()
            }
        return when (field) {
            ConsultationField.FullName -> nameError(value)
            ConsultationField.Phone -> if (PHONE.matches(value)) null else ConsultationCopy.ERR_PHONE
            ConsultationField.Topic -> topicError(value)
        }
    }

    /**
     * Runtime digits are normalised before they are validated or stored
     * (AGENTS.md): an Arabic-locale keyboard types Arabic-Indic digits the page's
     * country input already accepts, and the server's rule is ASCII.
     */
    fun toLatinDigits(value: String): String =
        buildString(value.length) {
            for (character in value) {
                when (character) {
                    in '\u0660'..'\u0669' -> append('0' + (character - '\u0660'))
                    in '\u06F0'..'\u06F9' -> append('0' + (character - '\u06F0'))
                    else -> append(character)
                }
            }
        }

    fun packageError(packageId: String): String? =
        if (packageId.isBlank()) ConsultationCopy.ERR_PACKAGE else null

    fun slotError(selected: Int, required: Int): String? =
        if (selected != required) ConsultationCopy.ERR_SLOT_COUNT else null

    private fun nameError(value: String): String? = when {
        value.length < 2 -> ConsultationCopy.ERR_NAME_SHORT
        value.length > 120 -> ConsultationCopy.ERR_NAME_LONG
        else -> null
    }

    private fun topicError(value: String): String? = when {
        value.length < TOPIC_MIN -> ConsultationCopy.ERR_TOPIC_SHORT
        value.length > TOPIC_MAX -> ConsultationCopy.ERR_TOPIC_LONG
        else -> null
    }
}
