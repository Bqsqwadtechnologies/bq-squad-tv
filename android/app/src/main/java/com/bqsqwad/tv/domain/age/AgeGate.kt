package com.bqsqwad.tv.domain.age

import java.time.LocalDate
import java.time.Period

enum class ContentAccess { GENERAL, ADULT }

data class AgeDecision(val age: Int, val mayAccessAdult: Boolean) {
    fun allows(contentAccess: ContentAccess): Boolean =
        contentAccess == ContentAccess.GENERAL || mayAccessAdult
}

object AgeGate {
    fun evaluate(dateOfBirth: LocalDate, today: LocalDate = LocalDate.now()): AgeDecision {
        require(!dateOfBirth.isAfter(today)) { "Date of birth cannot be in the future." }
        val age = Period.between(dateOfBirth, today).years
        return AgeDecision(age = age, mayAccessAdult = age >= 18)
    }
}
