package com.bqsqwad.tv.domain.session
import org.junit.Assert.*
import org.junit.Test
class HeartbeatPolicyTest {
 @Test fun heartbeatCadenceIsFifteenSeconds(){assertEquals(15_000L,HeartbeatPolicy.INTERVAL_MILLIS)}
 @Test fun retriesUseExponentialBackoff(){assertEquals(1_000L,HeartbeatPolicy.retryDelayMillis(0));assertEquals(2_000L,HeartbeatPolicy.retryDelayMillis(1));assertEquals(4_000L,HeartbeatPolicy.retryDelayMillis(2))}
 @Test fun playbackPausesAfterTwoConsecutiveFailures(){assertFalse(HeartbeatPolicy.mustPauseAfterFailures(1));assertTrue(HeartbeatPolicy.mustPauseAfterFailures(2))}
}
