package com.bqsqwad.tv.data.wallet
import retrofit2.http.*
data class PlayProductOffer(val productId:String,val title:String,val credits:Int,val description:String?=null)
data class WalletSummary(val balanceMinor:Long,val currency:String="NGN",val dailySpendLimitMinor:Long?=null,val spentTodayMinor:Long?=null)
data class LedgerEntry(val id:String,val description:String,val amountMinor:Long,val createdAt:String,val kind:String)
data class WalletLedgerResponse(val items:List<LedgerEntry> = emptyList())
data class VerifyPlayPurchaseRequest(val productId:String,val purchaseToken:String,val orderId:String?,val packageName:String="com.bqsqwad.tv")
data class VerifyPlayPurchaseResponse(val credited:Boolean,val balanceMinor:Long,val currency:String="NGN",val message:String?=null)
interface WalletApi {
 @GET("v1/wallet") suspend fun wallet(@Header("Authorization") bearer:String):WalletSummary
 @GET("v1/wallet/ledger") suspend fun ledger(@Header("Authorization") bearer:String):WalletLedgerResponse
 @GET("v1/wallet/google-play/products") suspend fun products(@Header("Authorization") bearer:String):List<PlayProductOffer>
 @POST("v1/wallet/google-play/verify") suspend fun verify(@Header("Authorization") bearer:String,@Body request:VerifyPlayPurchaseRequest):VerifyPlayPurchaseResponse
}
