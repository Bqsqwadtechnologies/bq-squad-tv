package com.bqsqwad.tv.data.producer
import com.bqsqwad.tv.BuildConfig
import com.bqsqwad.tv.data.auth.awaitResult
import com.google.firebase.auth.FirebaseAuth
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
class ProducerRepository {
 private val api:ProducerApi by lazy {
  require(!BuildConfig.API_BASE_URL.contains(".invalid")){"Producer service is not configured."}
  Retrofit.Builder().baseUrl(BuildConfig.API_BASE_URL.trimEnd('/')+"/").client(OkHttpClient.Builder().build()).addConverterFactory(MoshiConverterFactory.create(Moshi.Builder().add(KotlinJsonAdapterFactory()).build())).build().create(ProducerApi::class.java)
 }
 suspend fun summary():ProducerSummary {
  val user=FirebaseAuth.getInstance().currentUser?:error("Sign in required")
  val token=user.getIdToken(false).awaitResult().token?:error("Authentication expired")
  return api.summary("Bearer "+token)
 }
}
