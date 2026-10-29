package com.royaraqamia.app.plans

import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.MyUsageResponse
import org.junit.Assert.assertEquals
import org.junit.Test

/** The account card's model, from the endpoint's own body (#648). */
class UsageScreenModelTest {
    @Test
    fun `the state maps to the rows the card draws`() {
        val body = """
            {
              "success": true,
              "state": {
                "plan": "pro",
                "unlimited": false,
                "expiresAt": "2027-01-31T00:00:00.000Z",
                "counters": [
                  {
                    "key": "quran.surah.read",
                    "label": "سور القرآن",
                    "window": "lifetime",
                    "cap": 10,
                    "used": 4,
                    "remaining": 6
                  }
                ]
              }
            }
        """.trimIndent()

        val response = (ContractCodec.decode<MyUsageResponse>(body) as ApiResult.Success).value
        val model = UsageScreenModel.from(response)

        assertEquals("pro", model.plan)
        assertEquals(false, model.unlimited)
        assertEquals("2027-01-31T00:00:00.000Z", model.expiresAt)
        assertEquals(1, model.counters.size)
        assertEquals("quran.surah.read", model.counters.single().key)
        assertEquals(6L, model.counters.single().remaining)
    }
}
