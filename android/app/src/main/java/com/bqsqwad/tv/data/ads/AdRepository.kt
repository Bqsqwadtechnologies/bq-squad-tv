package com.bqsqwad.tv.data.ads
import com.bqsqwad.tv.BuildConfig
import com.bqsqwad.tv.data.auth.awaitResult
import com.google.firebase.auth.FirebaseAuth
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit
class AdRepository {
 private val api:AdApi by lazy {
  require(!BuildConfig.API_BASE_URL.contains(".invalid")){"Ad service is not configured."}
  Retrofit.Builder().baseUrl(BuildConfig.API_BASE_URL.trimEnd('/')+"/").client(OkHttpClient.Builder().connectTimeout(12,TimeUnit.SECONDS).readTimeout(15,TimeUnit.SECONDS).build()).addConverterFactory(MoshiConverterFactory.create(Moshi.Builder().add(KotlinJsonAdapterFactory()).build())).build().create(AdApi::class.java)
 }
 private suspend fun bearer():String {
  val user=FirebaseAuth.getInstance().currentUser?:error("Sign in required")
  return "Bearer "+(user.getIdToken(false).awaitResult().token?:error("Authentication expired"))
 }
 suspend fun next(channelId:String,slot:String)=api.next(bearer(),channelId,slot)
 suspend fun track(adId:String,event:String,position:Int=0)=api.event(bearer(),adId,AdEventRequest(event,position))
}
