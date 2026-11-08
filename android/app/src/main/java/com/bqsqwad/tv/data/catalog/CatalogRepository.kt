package com.bqsqwad.tv.data.catalog
import com.bqsqwad.tv.BuildConfig
import com.bqsqwad.tv.data.auth.awaitResult
import com.google.firebase.auth.FirebaseAuth
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit
class CatalogRepository {
 private val api:CatalogApi by lazy {
  require(!BuildConfig.API_BASE_URL.contains(".invalid")) { "Catalog service is not configured. Set API_BASE_URL in android/local.properties." }
  Retrofit.Builder().baseUrl(BuildConfig.API_BASE_URL.trimEnd('/')+"/")
   .client(OkHttpClient.Builder().connectTimeout(12,TimeUnit.SECONDS).readTimeout(18,TimeUnit.SECONDS).build())
   .addConverterFactory(MoshiConverterFactory.create(Moshi.Builder().add(KotlinJsonAdapterFactory()).build())).build().create(CatalogApi::class.java)
 }
 private suspend fun bearer():String {
  val user=FirebaseAuth.getInstance().currentUser ?: return ""
  val token=user.getIdToken(false).awaitResult().token ?: return ""
  return "Bearer "+token
 }
 suspend fun home()=api.home(bearer())
 suspend fun search(query:String,type:String?=null,category:String?=null,language:String?=null)=api.search(bearer(),query,type,category,language)
 suspend fun channel(id:String)=api.channel(bearer(),id)
}
