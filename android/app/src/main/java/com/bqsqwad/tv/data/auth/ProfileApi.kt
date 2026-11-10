package com.bqsqwad.tv.data.auth

import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

data class CompleteProfileRequest(
    val dateOfBirth: String,
    val parentalPin: String?
)

data class CompleteProfileResponse(
    val profileComplete: Boolean,
    val adultEligible: Boolean,
    val parentalPinEnabled: Boolean
)

interface ProfileApi {
    @POST("v1/profile/complete")
    suspend fun completeProfile(
        @Header("Authorization") bearerToken: String,
        @Body request: CompleteProfileRequest
    ): CompleteProfileResponse
}
