package com.bqsqwad.tv.data.catalog
import android.content.Context
import androidx.room.Room
import com.bqsqwad.tv.BuildConfig
import com.bqsqwad.tv.data.cache.BqTvDatabase
import com.bqsqwad.tv.data.cache.CachedChannel
import com.bqsqwad.tv.data.auth.awaitResult
import com.google.firebase.auth.FirebaseAuth
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit
class CatalogRepository(context:Context) {
 private val database by lazy { Room.databaseBuilder(context.applicationContext,BqTvDatabase::class.java,"bq-sqwad-tv.db").fallbackToDestructiveMigration().build() }
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
 suspend fun home():CatalogHomeResponse {
  return try {
   val response=api.home(bearer())
   val sections=listOf("liveNow" to response.liveNow,"startingSoon" to response.startingSoon,"channels" to response.channels,"replays" to response.replays,"continueWatching" to response.continueWatching,"trending" to response.trending)
   val now=System.currentTimeMillis()
   database.channelCache().putAll(sections.flatMap{(section,items)->items.map{CachedChannel(it.id,section,it.title,it.category,it.posterUrl,it.isLive,it.currentProgramme,it.language,now)}})
   response
  } catch(error:Exception) {
   val dao=database.channelCache()
   val live=dao.inSection("liveNow").map{it.toSummary()}
   val soon=dao.inSection("startingSoon").map{it.toSummary()}
   val channels=dao.inSection("channels").map{it.toSummary()}
   val replays=dao.inSection("replays").map{it.toSummary()}
   val watching=dao.inSection("continueWatching").map{it.toSummary()}
   val trending=dao.inSection("trending").map{it.toSummary()}
   if(listOf(live,soon,channels,replays,watching,trending).all{it.isEmpty()}) throw error
   CatalogHomeResponse(live,soon,channels,replays,watching,trending)
  }
 }
 private fun CachedChannel.toSummary()=ChannelSummary(id,title,category,posterUrl,isLive,currentProgramme,language)
 suspend fun search(query:String,type:String?=null,category:String?=null,language:String?=null)=api.search(bearer(),query,type,category,language)
 suspend fun channel(id:String)=api.channel(bearer(),id)
}
