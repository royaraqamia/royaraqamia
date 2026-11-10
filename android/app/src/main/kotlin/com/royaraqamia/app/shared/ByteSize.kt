package com.royaraqamia.app.shared

import java.util.Locale

/**
 * The number half of a known size, before a surface puts it into words
 * (ADR-0104). The site's `byteSizeParts` is the other half of this pair: whole
 * kilobytes below a megabyte, one decimal of a megabyte under ten, and whole
 * megabytes above, all in ASCII digits.
 *
 * The unit is an enum rather than a word so a caller substitutes it from its own
 * generated copy instead of retyping the Arabic here.
 */
data class ByteSizeParts(val unit: Unit, val value: String) {
    enum class Unit { KILOBYTES, MEGABYTES }
}

fun byteSizeParts(bytes: Long): ByteSizeParts {
    val known = if (bytes > 0) bytes else 0L
    val mb = known.toDouble() / (1024 * 1024)
    return if (mb >= 1) {
        val value =
            if (mb >= 10) Math.round(mb).toString()
            else String.format(Locale.US, "%.1f", mb)
        ByteSizeParts(ByteSizeParts.Unit.MEGABYTES, value)
    } else {
        val kb = Math.round(known / 1024.0)
        // A byte we hold is never "0 ك.ب" — only an empty store is.
        val value = if (known > 0 && kb == 0L) 1L else kb
        ByteSizeParts(ByteSizeParts.Unit.KILOBYTES, value.toString())
    }
}
