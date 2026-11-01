package com.royaraqamia.app.store.outbox

/**
 * One HTTP request a queued intent becomes (#650).
 *
 * Product-agnostic on purpose: a product's transport ([com.royaraqamia.app.store.habitflow.HabitWriteTransport],
 * [com.royaraqamia.app.store.spendtrack.SpendtrackWriteTransport]) only decides which method and path a
 * `type` maps to, and the drainer only needs something it can send.
 */
data class WriteRequest(val method: String, val path: String, val body: String?)
