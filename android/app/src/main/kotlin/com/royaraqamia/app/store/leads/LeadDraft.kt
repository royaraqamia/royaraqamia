package com.royaraqamia.app.store.leads

/**
 * The answers a visitor typed into one lead form (#929).
 *
 * One draft for all three forms rather than a class per form: the forms share
 * most of their fields, and a draft that carried only its own kind's fields
 * would make the screen's state machine three machines. Each form reads and
 * writes the subset it draws ([LeadFormSpec]), and [LeadsWriteTransport] sends
 * only that subset, so a field a different form owns cannot leak into a body.
 *
 * `courseSlug` is fixed by the training form and ignored by the other two.
 */
data class LeadDraft(
    val fullName: String = "",
    val phone: String = "",
    val email: String = "",
    val goal: String = "",
    val cohortId: String = "",
    val projectType: String = "",
    val description: String = "",
    val budgetRange: String = "",
    val timeline: String = "",
    val existingUrl: String = "",
    val company: String = "",
    val currentProjects: String = "",
    val needs: String = "",
    val preferredStart: String = "",
)
