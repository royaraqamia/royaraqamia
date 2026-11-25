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

import org.junit.Assert.assertEquals
import org.junit.Test

class KeyboardDigitsTest {

    private fun block(start: Int) = (start until start + 10).joinToString("") { it.toChar().toString() }

    @Test
    fun `arabic indic digits fold to ascii`() {
        assertEquals("0123456789", block(0x0660).toAsciiDigits())
    }

    @Test
    fun `persian digits fold to ascii`() {
        assertEquals("9876543210", block(0x06f0).reversed().toAsciiDigits())
    }

    @Test
    fun `other decimal blocks fold to ascii`() {
        assertEquals("012", block(0x0966).take(3).toAsciiDigits())
        assertEquals("345", block(0x0e50).drop(3).take(3).toAsciiDigits())
    }

    @Test
    fun `letters punctuation and ascii digits are untouched`() {
        assertEquals("مرحبا 123،!", "مرحبا 123،!".toAsciiDigits())
    }
}
