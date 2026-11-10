package com.bqsqwad.tv.domain.session
object HeartbeatPolicy {
 const val INTERVAL_MILLIS=15_000L
 const val MAX_RETRIES=2
 fun retryDelayMillis(attempt:Int):Long=1_000L shl attempt.coerceIn(0,3)
 fun mustPauseAfterFailures(consecutiveFailures:Int)=consecutiveFailures>=2
}
