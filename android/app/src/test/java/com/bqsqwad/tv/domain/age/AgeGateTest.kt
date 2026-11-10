package com.bqsqwad.tv.domain.age

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class AgeGateTest {
    @Test fun underEighteenCannotAccessAdultContent() {
        val decision = AgeGate.evaluate(LocalDate.parse("2010-01-01"), LocalDate.parse("2026-11-08"))
        assertFalse(decision.allows(ContentAccess.ADULT))
        assertTrue(decision.allows(ContentAccess.GENERAL))
    }

    @Test fun exactlyEighteenIsAdultEligibleAtLocalAgeCalculationOnly() {
        val decision = AgeGate.evaluate(LocalDate.parse("2008-11-08"), LocalDate.parse("2026-11-08"))
        assertTrue(decision.mayAccessAdult)
    }
}
