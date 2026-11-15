package com.bqsqwad.tv.data.auth

import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

data class CompleteProfileRequest(
    val dateOfBirth: String,
    val parentalPin: String?,
)

data class CompleteProfileResponse(
    val profileComplete: Boolean,
    val adultEligible: Boolean,
    val parentalPinEnabled: Boolean,
)

data class SendEmailOtpResponse(
    val sent: Boolean,
    val alreadyVerified: Boolean? = null,
    val expiresInSeconds: Long? = null,
)

data class VerifyEmailOtpRequest(
    val code: String,
)

data class VerifyEmailOtpResponse(
    val verified: Boolean,
)

data class PushTokenRequest(
    val token: String,
    val platform: String = "android",
)

data class PushTokenResponse(
    val registered: Boolean,
)

interface ProfileApi {
    @POST("v1/profile/complete")
    suspend fun completeProfile(
        @Header("Authorization") bearerToken: String,
        @Body request: CompleteProfileRequest,
    ): CompleteProfileResponse

    @POST("v1/auth/email/send-code")
    suspend fun sendEmailVerificationCode(
        @Header("Authorization") bearerToken: String,
    ): SendEmailOtpResponse

    @POST("v1/auth/email/verify-code")
    suspend fun verifyEmailCode(
        @Header("Authorization") bearerToken: String,
        @Body request: VerifyEmailOtpRequest,
    ): VerifyEmailOtpResponse

    @POST("v1/devices/push-token")
    suspend fun registerPushToken(
        @Header("Authorization") bearerToken: String,
        @Body request: PushTokenRequest,
    ): PushTokenResponse
}
