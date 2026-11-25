/*
 * Copyright (C) 2026 royaraqamia
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package dev.patrickgold.florisboard.ime.editor

/**
 * The repo writes ASCII digits everywhere (AGENTS.md, ADR-0219 decision 5).
 *
 * Upstream ships numeric rows in many scripts; those glyphs stay in the vendored
 * assets, but anything the IME commits to a field is folded here. Character.digit
 * covers Arabic-Indic, Extended Arabic-Indic and the other decimal blocks without
 * naming each one, and leaves letters and punctuation untouched.
 */
internal fun String.toAsciiDigits(): String = buildString(length) {
    for (char in this@toAsciiDigits) {
        val value = Character.digit(char, 10)
        append(if (Character.isDigit(char) && value in 0..9) ('0'.code + value).toChar() else char)
    }
}
