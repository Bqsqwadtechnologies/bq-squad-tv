package com.bqsqwad.tv.data.catalog
import retrofit2.http.*

data class ChannelSummary(
    val id: String,
    val title: String,
    val category: String = "Channel",
    val posterUrl: String? = null,
    val isLive: Boolean = false,
    val currentProgramme: String? = null,
    val language: String? = null,
)

data class Programme(
    val id: String,
    val title: String,
    val startsAt: String,
    val endsAt: String,
    val description: String? = null,
)

data class CatalogHomeResponse(
    val liveNow: List<ChannelSummary> = emptyList(),
    val startingSoon: List<ChannelSummary> = emptyList(),
    val channels: List<ChannelSummary> = emptyList(),
    val replays: List<ChannelSummary> = emptyList(),
    val continueWatching: List<ChannelSummary> = emptyList(),
    val trending: List<ChannelSummary> = emptyList(),
)

data class ChannelDetailResponse(
    val channel: ChannelSummary,
    val schedule: List<Programme> = emptyList(),
    val replays: List<ChannelSummary> = emptyList(),
)

data class SearchResponse(
    val results: List<ChannelSummary> = emptyList(),
)

data class CommentItem(
    val id: String,
    val body: String,
    val viewerNumber: String = "Viewer",
    val createdAt: String? = null,
)

data class SubmitCommentRequest(
    val body: String,
)

data class SubmitCommentResponse(
    val commentId: String,
    val status: String,
    val message: String,
)

data class SubmitRatingRequest(
    val stars: Int,
)

data class SubmitRatingResponse(
    val ratingCount: Int,
    val averageStars: Double,
    val updated: Boolean,
)

interface CatalogApi {
    @GET("v1/catalog/home")
    suspend fun home(
        @Header("Authorization") bearer: String,
    ): CatalogHomeResponse

    @GET("v1/catalog/search")
    suspend fun search(
        @Header("Authorization") bearer: String,
        @Query("q") query: String,
        @Query("type") type: String?,
        @Query("category") category: String?,
        @Query("language") language: String?,
    ): SearchResponse

    @GET("v1/channels/{channelId}")
    suspend fun channel(
        @Header("Authorization") bearer: String,
        @Path("channelId") channelId: String,
    ): ChannelDetailResponse

    @GET("v1/content-assets/{assetId}/comments")
    suspend fun comments(
        @Header("Authorization") bearer: String,
        @Path("assetId") assetId: String,
    ): List<CommentItem>

    @POST("v1/content-assets/{assetId}/comments")
    suspend fun submitComment(
        @Header("Authorization") bearer: String,
        @Path("assetId") assetId: String,
        @Body request: SubmitCommentRequest,
    ): SubmitCommentResponse

    @GET("v1/channels/{channelId}/chat")
    suspend fun liveChat(@Header("Authorization") bearer: String, @Path("channelId") channelId: String): LiveChatResponse

    @POST("v1/channels/{channelId}/chat")
    suspend fun liveChatAction(@Header("Authorization") bearer: String, @Path("channelId") channelId: String, @Body request: LiveChatRequest): Map<String, Any?>

    @POST("v1/content-assets/{assetId}/rating")
    suspend fun submitRating(
        @Header("Authorization") bearer: String,
        @Path("assetId") assetId: String,
        @Body request: SubmitRatingRequest,
    ): SubmitRatingResponse
}


data class LiveChatMessage(val id: String, val body: String, val author: String = "Viewer", val createdAt: String? = null)
data class LiveChatResponse(val enabled: Boolean = false, val slowModeSeconds: Int = 0, val subscriberOnly: Boolean = false, val messages: List<LiveChatMessage> = emptyList())
data class LiveChatRequest(val action: String, val body: String? = null, val messageId: String? = null, val reason: String? = null)
