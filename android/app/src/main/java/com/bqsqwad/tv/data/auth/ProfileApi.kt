package com.bqsqwad.tv.data.auth

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path

data class LegalAcceptanceRequest(val audience: String = "public", val acceptedSlugs: List<String>)

data class LegalAcceptanceResponse(val accepted: Boolean)

data class CompleteProfileRequest(
    val dateOfBirth: String,
    val parentalPin: String?,
    val countryCode: String? = null,
)

data class CompleteProfileResponse(
    val profileComplete: Boolean,
    val adultEligible: Boolean,
    val parentalPinEnabled: Boolean,
    val countryCode: String? = null,
    val currency: String = "USD",
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

data class ThemePreferenceResponse(
    val themeMode: String = "system",
)

data class ThemePreferenceRequest(
    val themeMode: String,
)

data class ThemePreferenceSaveResponse(
    val saved: Boolean,
    val themeMode: String,
)

interface ProfileApi {
    @POST("v1/legal/acceptance")
    suspend fun acceptLegalPages(
        @Header("Authorization") bearerToken: String,
        @Body request: LegalAcceptanceRequest,
    ): LegalAcceptanceResponse

    @GET("v1/notifications")
    suspend fun notifications(
        @Header("Authorization") bearerToken: String,
    ): List<AppNotification>

    @POST("v1/notifications/{notificationId}/read")
    suspend fun markNotificationRead(
        @Header("Authorization") bearerToken: String,
        @Path("notificationId") notificationId: String,
    ): NotificationReadResponse

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

    @retrofit2.http.GET("v1/profile/preferences")
    suspend fun getPreferences(
        @Header("Authorization") bearerToken: String,
    ): ThemePreferenceResponse

    @retrofit2.http.PUT("v1/profile/preferences")
    suspend fun saveThemePreference(
        @Header("Authorization") bearerToken: String,
        @Body request: ThemePreferenceRequest,
    ): ThemePreferenceSaveResponse
}

data class AppNotification(
    val id: String,
    val title: String,
    val body: String,
    val deepLink: String? = null,
    val read: Boolean = false,
    val deliveryStatus: String = "unknown",
    val createdAt: String? = null,
)

data class NotificationReadResponse(
    val notificationId: String,
    val read: Boolean,
    val readAt: String? = null,
)
