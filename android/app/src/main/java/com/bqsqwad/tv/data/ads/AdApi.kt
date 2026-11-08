package com.bqsqwad.tv.data.ads
import retrofit2.http.*
data class AdBreak(val id:String,val campaignId:String,val title:String,val creativeUrl:String,val videoUrl:String?=null,val skipAfterSeconds:Int?=null,val durationSeconds:Int,val clickUrl:String?=null,val rewardEnabled:Boolean=false)
data class AdEventRequest(val event:String,val positionSeconds:Int=0)
interface AdApi {
 @GET("v1/ads/next") suspend fun next(@Header("Authorization") bearer:String,@Query("channelId") channelId:String,@Query("slot") slot:String):AdBreak?
 @POST("v1/ads/{adId}/events") suspend fun event(@Header("Authorization") bearer:String,@Path("adId") adId:String,@Body body:AdEventRequest)
}
