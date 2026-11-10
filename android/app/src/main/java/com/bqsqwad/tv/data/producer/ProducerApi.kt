package com.bqsqwad.tv.data.producer
import retrofit2.http.GET
import retrofit2.http.Header
data class ProducerSummary(val approved:Boolean,val roleTags:List<String> = emptyList(),val channelCount:Int=0,val liveViewers:Int=0,val watchSeconds:Long=0,val earningsMinor:Long=0,val currency:String="NGN")
interface ProducerApi { @GET("v1/producer/mobile-summary") suspend fun summary(@Header("Authorization") bearer:String):ProducerSummary }
