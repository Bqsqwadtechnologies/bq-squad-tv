package com.bqsqwad.tv.data.currency

import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Locale

class CurrencyFormatterTest {
    @Test
    fun formatsSupportedCurrenciesUsingTheirMinorUnitPrecision() {
        val cases = mapOf(
            "NGN" to 2,
            "USD" to 2,
            "GBP" to 2,
            "GHS" to 2,
            "KES" to 2,
            "ZAR" to 2,
            "JPY" to 0,
            "KWD" to 3,
        )
        cases.forEach { (currency, digits) ->
            val result = CurrencyFormatter.formatMinorUnits(123456789L, currency, Locale.US)
            val suffix = if (digits == 0) Regex("[0-9]{3}$") else Regex("[.,][0-9]{$digits}$")
            assertTrue("$currency should use $digits fractional digits: $result", suffix.containsMatchIn(result))
        }
    }


    @Test
    fun formatsSingleMinorUnitsAndNegativeAmountsExactly() {
        assertTrue(CurrencyFormatter.formatMinorUnits(1L, "NGN", Locale.US).endsWith("0.01"))
        assertTrue(CurrencyFormatter.formatMinorUnits(-1L, "KWD", Locale.US).contains("0.001"))
        assertTrue(CurrencyFormatter.formatMinorUnits(1L, "JPY", Locale.US).endsWith("1"))
    }

    @Test
    fun keepsLargeMinorUnitAmountsExact() {
        val formatted = CurrencyFormatter.formatMinorUnits(9_007_199_254_740_991L, "USD", Locale.US)
        assertTrue(formatted.contains("90,071,992,547,409.91"))
    }

    @Test
    fun doesNotUseFloatingPointForMinorUnitConversion() {
        assertTrue(
            CurrencyFormatter.formatMinorUnits(1L, "KWD", Locale.US).endsWith("0.001"),
        )
    }
}
