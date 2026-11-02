package com.royaraqamia.app.shell

/**
 * The runs of ASCII digits and their separators inside [text] (#652).
 *
 * The read-only digit face (Aref Ruqaa, `--font-digits`) is a digit-only subset,
 * so it is applied to the numbers in a sentence and never to the sentence: the
 * Arabic around a number stays in the UI face, which is what the stylesheet's
 * `unicode-range: U+30-39` does on the site (ADR-0054).
 *
 * A run may carry `.` and `,` — a version (`1.0.4`), a size (`7.1`) and a grouped
 * count (`1,250`) are one run each — and it never starts with one, so the `·`
 * between two numbers and the Arabic between them are left to the UI face.
 * Arabic-Indic and Persian numerals are not runs: the app writes ASCII digits
 * everywhere, and a number the subset cannot draw would be a hole in the card.
 *
 * Pure, so the JVM test beside the update cases can ask it without a device.
 */
internal fun digitRunsOf(text: String): List<IntRange> =
    DIGIT_RUNS.findAll(text).map { it.range }.toList()

private val DIGIT_RUNS = Regex("[0-9][0-9.,]*")
