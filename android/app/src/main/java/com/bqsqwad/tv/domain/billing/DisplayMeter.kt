package com.bqsqwad.tv.domain.billing
data class MeterDisplay(val estimatedTotalMinor:Long,val ratePerSecondMinor:Double,val warningSeconds:Long?)
object DisplayMeter {
 fun estimate(serverSettledMinor:Long,ratePerMinuteMinor:Long,elapsedSeconds:Long):MeterDisplay {
  val perSecond=ratePerMinuteMinor.toDouble()/60.0
  return MeterDisplay(serverSettledMinor+(perSecond*elapsedSeconds).toLong(),perSecond,null)
 }
 fun warning(timeRemainingSeconds:Long):Long? = when {
  timeRemainingSeconds<=60L -> 60L
  timeRemainingSeconds<=300L -> 300L
  else -> null
 }
}
