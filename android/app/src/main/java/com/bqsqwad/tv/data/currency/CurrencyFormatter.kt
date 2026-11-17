package com.bqsqwad.tv.data.currency

import java.math.BigDecimal
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

object CurrencyFormatter {
    fun formatMinorUnits(
        amountMinor: Long,
        currencyCode: String,
        locale: Locale = Locale.getDefault(),
    ): String {
        val currency = Currency.getInstance(currencyCode.uppercase(Locale.ROOT))
        val digits = currency.defaultFractionDigits.coerceAtLeast(0)
        val amount = BigDecimal.valueOf(amountMinor).movePointLeft(digits)
        return NumberFormat.getCurrencyInstance(locale).apply {
            this.currency = currency
            minimumFractionDigits = digits
            maximumFractionDigits = digits
        }.format(amount)
    }
}
