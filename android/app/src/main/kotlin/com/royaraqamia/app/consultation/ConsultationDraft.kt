package com.royaraqamia.app.consultation

/** One booking's answers as the wizard collects them (#930). */
data class ConsultationDraft(
    val packageId: String = "",
    val slotIds: List<String> = emptyList(),
    val fullName: String = "",
    val phone: String = "",
    val topic: String = "",
)

/** The fields the details step validates, one error each. */
enum class ConsultationField {
    FullName,
    Phone,
    Topic,
}
