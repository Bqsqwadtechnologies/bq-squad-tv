package com.bqsqwad.tv.data.session
import retrofit2.http.*
data class IntegrityChallenge(val nonce:String)
data class StartSessionRequest(val channelId:String,val integrityToken:String,val idempotencyKey:String)
data class SessionSnapshot(val sessionId:String,val playbackUrl:String,val ratePerMinuteMinor:Long,val walletBalanceMinor:Long,val currency:String="NGN",val timeRemainingSeconds:Long,val sessionTotalMinor:Long,val active:Boolean=true)
data class HeartbeatRequest(val clientSequence:Long)
interface SessionApi {
 @GET("v1/security/integrity/challenge") suspend fun integrityChallenge(@Header("Authorization") bearer:String):IntegrityChallenge
 @POST("v1/sessions/start") suspend fun start(@Header("Authorization") bearer:String,@Body body:StartSessionRequest):SessionSnapshot
 @POST("v1/sessions/{sessionId}/heartbeat") suspend fun heartbeat(@Header("Authorization") bearer:String,@Path("sessionId") sessionId:String,@Body body:HeartbeatRequest):SessionSnapshot
 @POST("v1/sessions/{sessionId}/end") suspend fun end(@Header("Authorization") bearer:String,@Path("sessionId") sessionId:String)
}
