package com.bqsqwad.tv.data.catalog
import retrofit2.http.*
data class ChannelSummary(val id:String,val title:String,val category:String="Channel",val posterUrl:String?=null,val isLive:Boolean=false,val currentProgramme:String?=null,val language:String?=null)
data class Programme(val id:String,val title:String,val startsAt:String,val endsAt:String,val description:String?=null)
data class CatalogHomeResponse(val liveNow:List<ChannelSummary> = emptyList(),val startingSoon:List<ChannelSummary> = emptyList(),val channels:List<ChannelSummary> = emptyList(),val replays:List<ChannelSummary> = emptyList(),val continueWatching:List<ChannelSummary> = emptyList(),val trending:List<ChannelSummary> = emptyList())
data class ChannelDetailResponse(val channel:ChannelSummary,val schedule:List<Programme> = emptyList(),val replays:List<ChannelSummary> = emptyList())
data class SearchResponse(val results:List<ChannelSummary> = emptyList())
interface CatalogApi {
 @GET("v1/catalog/home") suspend fun home(@Header("Authorization") bearer:String):CatalogHomeResponse
 @GET("v1/catalog/search") suspend fun search(@Header("Authorization") bearer:String,@Query("q") query:String,@Query("type") type:String?,@Query("category") category:String?,@Query("language") language:String?):SearchResponse
 @GET("v1/channels/{channelId}") suspend fun channel(@Header("Authorization") bearer:String,@Path("channelId") channelId:String):ChannelDetailResponse
}
