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

package dev.patrickgold.florisboard.ime.rewrite

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The network boundary, asserted in code rather than on a device: the only way
 * to reach the transport is through a one-use tap capability, and a failed or
 * replayed tap never opens a connection.
 */
class RewriteGatewayTest {

    private class RecordingTransport : RewriteTransport {
        val calls = mutableListOf<Pair<String, String>>()
        var answer: String? = """{"success":true,"suggestion":"نص أوضح."}"""

        override fun post(endpoint: String, token: String, text: String): String? {
            calls += token to text
            return answer
        }
    }

    private fun gateway(transport: RecordingTransport) =
        RewriteGateway(transport, "https://royaraqamia.com/api/keyboard/rewrite")

    @Test
    fun `no network without a tap and no second call from a replayed tap`() {
        val transport = RecordingTransport()
        val gateway = gateway(transport)

        assertEquals(RewriteResult.Failure, gateway.rewrite(null, "token"))
        assertTrue(transport.calls.isEmpty())

        val tap = RewriteTap.fromComposing("النص الحالي")
        assertEquals(RewriteResult.Suggestion("نص أوضح."), gateway.rewrite(tap, "token"))
        assertEquals(listOf("token" to "النص الحالي"), transport.calls)

        assertEquals(RewriteResult.Failure, gateway.rewrite(tap, "token"))
        assertEquals(1, transport.calls.size)
    }

    @Test
    fun `blank and overlong composing text never leave the device`() {
        val transport = RecordingTransport()
        val gateway = gateway(transport)

        assertEquals(RewriteResult.Failure, gateway.rewrite(RewriteTap.fromComposing("   "), "token"))
        assertEquals(
            RewriteResult.Failure,
            gateway.rewrite(RewriteTap.fromComposing("خ".repeat(REWRITE_MAX_INPUT_CHARS + 1)), "token"),
        )
        assertTrue(transport.calls.isEmpty())
    }

    @Test
    fun `an overlong or refused answer stays a failure and spends no second call`() {
        val transport = RecordingTransport()
        transport.answer = """{"success":true,"suggestion":"${"خ".repeat(REWRITE_MAX_OUTPUT_CHARS + 1)}"}"""
        val gateway = gateway(transport)
        assertEquals(RewriteResult.Failure, gateway.rewrite(RewriteTap.fromComposing("نص"), "token"))

        transport.answer = """{"success":false,"error":"من الخادم"}"""
        assertEquals(RewriteResult.Failure, gateway.rewrite(RewriteTap.fromComposing("نص"), "token"))
        assertEquals(2, transport.calls.size)
    }
}
