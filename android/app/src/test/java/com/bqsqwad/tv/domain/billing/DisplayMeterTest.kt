package com.bqsqwad.tv.domain.billing
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
class DisplayMeterTest{
 @Test fun estimateIsDisplayOnlyAndUsesServerSettledTotalAsBase(){
  val result=DisplayMeter.estimate(1200,600,10)
  assertEquals(10.0,result.ratePerSecondMinor,0.001)
  assertEquals(1300,result.estimatedTotalMinor)
 }
 @Test fun warningThresholdsAreFiveAndOneMinutes(){
  assertEquals(300L,DisplayMeter.warning(250))
  assertEquals(60L,DisplayMeter.warning(45))
  assertNull(DisplayMeter.warning(600))
 }
}
