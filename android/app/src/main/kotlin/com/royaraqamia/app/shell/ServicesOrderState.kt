package com.royaraqamia.app.shell

/**
 * The services sheet's reorder, as the parity row names it (#806).
 *
 * The sheet has one thing to say about the order: what just moved. It is a
 * state rather than a string in the composable because the words are generated
 * (`shared/copy/shell-services-order.json`) and the pair check reads this file
 * to know which states the app claims to draw (ADR-0098).
 */
sealed interface ServicesOrderState {
    /** A row was put somewhere new; the sentence carries its label and slot. */
    data object Moved : ServicesOrderState
}
