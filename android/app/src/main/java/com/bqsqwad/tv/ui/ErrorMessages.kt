package com.bqsqwad.tv.ui

/**
 * Safe, consistent messages for people using the app.
 * Detailed causes belong in diagnostic logs, never in visible error text.
 */
object ErrorMessages {
    const val NETWORK = "Check your connection and try again."
    const val SIGN_IN_EXPIRED = "Please sign in again."
    const val COUNTRY_UNAVAILABLE = "This content is not available in your country."
    const val NOT_ENOUGH_BALANCE = "Your balance is not enough for this action."
    const val TRY_AGAIN = "We could not load this. Try again."
    const val NOT_AVAILABLE = "This is not available right now."
    const val SIGN_IN_FAILED = "We could not sign you in. Check your details and try again."
    const val VERIFICATION_FAILED = "We could not verify your email. Check the code and try again."
    const val PASSWORD_RESET_FAILED = "We could not request a password reset. Check your email and try again."
    const val PROFILE_FAILED = "Your profile could not be updated. Try again."
    const val WALLET_UNAVAILABLE = "Your wallet is not available right now. Try again."
    const val GENERIC = "Something went wrong. Please try again."

    fun friendlyMessage(code: String?, fallback: String? = null): String {
        return when (code?.uppercase()) {
            "AUTH_EXPIRED", "UNAUTHENTICATED" -> SIGN_IN_EXPIRED
            "LOW_BALANCE" -> NOT_ENOUGH_BALANCE
            "GEO_BLOCKED" -> COUNTRY_UNAVAILABLE
            "NETWORK", "TIMEOUT" -> NETWORK
            "NOT_FOUND", "PAGE_NOT_FOUND" -> NOT_AVAILABLE
            else -> fallback ?: TRY_AGAIN
        }
    }

    fun formatWithRef(message: String, ref: String?): String {
        return if (!ref.isNullOrBlank()) {
            "$message\nReference: $ref"
        } else {
            message
        }
    }
}
