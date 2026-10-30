package com.royaraqamia.app.plans

import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.MyPlanResponse
import org.junit.Assert.assertEquals
import org.junit.Test

/** The plan card's model, from the endpoint's own body (#648, ADR-0098). */
class UsageScreenModelTest {
    private val body =
        """
        {
          "success": true,
          "state": {
            "plan": "pro",
            "unlimited": false,
            "expiresAt": "2027-01-31T00:00:00.000Z",
            "counters": [
              {
                "key": "quran.surah.read",
                "label": "surah read",
                "window": "lifetime",
                "cap": 10,
                "used": 4,
                "remaining": 6
              }
            ]
          },
          "limits": [
            { "key": "notes", "label": "notes", "cap": 5, "used": 1, "remaining": 4 }
          ],
          "activations": [
            {
              "id": "3f1e7c2a-8b93-4c1e-9a55-2f2c4f0d1a77",
              "plan": "pro",
              "amountCents": 1200,
              "currency": "USD",
              "method": "shamcash",
              "note": null,
              "activatedAt": "2026-10-21T12:00:00.000Z",
              "expiresAt": "2026-11-21T12:00:00.000Z"
            }
          ]
        }
        """.trimIndent()

    private val model =
        UsageScreenModel.from((ContractCodec.decode<MyPlanResponse>(body) as ApiResult.Success).value)

    @Test
    fun `the state maps to the rows the card draws`() {
        assertEquals("pro", model.plan)
        assertEquals(false, model.unlimited)
        assertEquals("2027-01-31T00:00:00.000Z", model.expiresAt)
    }

    @Test
    fun `the caps share the list with the counted actions, counted first`() {
        // The site builds one list the same way (ADR-0093): a member reads what is
        // left in one place instead of guessing which list a number belongs to.
        assertEquals(listOf("quran.surah.read", "notes"), model.rows.map { it.key })
        assertEquals(4L, model.rows[0].used)
        assertEquals(10L, model.rows[0].cap)
        assertEquals(1L, model.rows[1].used)
        assertEquals(5L, model.rows[1].cap)
    }

    @Test
    fun `the history maps every payment the page lists`() {
        val activation = model.activations.single()

        assertEquals("3f1e7c2a-8b93-4c1e-9a55-2f2c4f0d1a77", activation.id)
        assertEquals(1200L, activation.amountCents)
        assertEquals("USD", activation.currency)
        assertEquals("shamcash", activation.method)
        assertEquals(null, activation.note)
        assertEquals("2026-10-21T12:00:00.000Z", activation.activatedAt)
        assertEquals("2026-11-21T12:00:00.000Z", activation.expiresAt)
    }

    @Test
    fun `a note arrives as it was written`() {
        val withNote = body.replace("\"note\": null", "\"note\": \"تحويل يدوي\"")

        val parsed = UsageScreenModel.from((ContractCodec.decode<MyPlanResponse>(withNote) as ApiResult.Success).value)

        assertEquals("تحويل يدوي", parsed.activations.single().note)
    }
}
