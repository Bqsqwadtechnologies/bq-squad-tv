package com.bqsqwad.tv.data.wallet
import com.bqsqwad.tv.BuildConfig
import com.bqsqwad.tv.data.auth.awaitResult
import com.google.firebase.auth.FirebaseAuth
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit
class WalletRepository {
 private val api:WalletApi by lazy {
  require(!BuildConfig.API_BASE_URL.contains(".invalid")) { "Wallet service is not configured. Set API_BASE_URL in android/local.properties." }
  Retrofit.Builder().baseUrl(BuildConfig.API_BASE_URL.trimEnd('/')+"/")
   .client(OkHttpClient.Builder().connectTimeout(15,TimeUnit.SECONDS).readTimeout(20,TimeUnit.SECONDS).build())
   .addConverterFactory(MoshiConverterFactory.create(Moshi.Builder().add(KotlinJsonAdapterFactory()).build())).build().create(WalletApi::class.java)
 }
 private suspend fun bearer():String {
  val user=FirebaseAuth.getInstance().currentUser ?: error("Sign in is required.")
  val token=user.getIdToken(false).awaitResult().token ?: error("Could not refresh authentication.")
  return "Bearer "+token
 }
 suspend fun wallet()=api.wallet(bearer())
 suspend fun ledger()=api.ledger(bearer())
 suspend fun products()=api.products(bearer())
 suspend fun verify(productId:String,token:String,orderId:String?)=api.verify(bearer(),VerifyPlayPurchaseRequest(productId,token,orderId))
}
