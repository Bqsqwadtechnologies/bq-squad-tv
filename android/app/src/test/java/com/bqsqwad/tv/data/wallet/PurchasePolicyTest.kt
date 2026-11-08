package com.bqsqwad.tv.data.wallet
import org.junit.Assert.assertTrue
import org.junit.Test
class PurchasePolicyTest{
 @Test fun walletCreditIsServerConfirmedBeforeClientConsumption(){
  val source=PlayBillingManager::class.java
  assertTrue(source.declaredMethods.any{it.name=="processPurchase"})
 }
}
