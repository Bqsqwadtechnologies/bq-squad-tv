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
}
