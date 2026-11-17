package com.bqsqwad.tv.data.notifications

import com.bqsqwad.tv.BuildConfig
import com.bqsqwad.tv.data.auth.AppNotification
import com.bqsqwad.tv.data.auth.ProfileApi
import com.bqsqwad.tv.data.auth.NotificationReadResponse
import com.bqsqwad.tv.data.security.FirebaseAppCheckInterceptor
import com.google.firebase.auth.FirebaseAuth
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import com.bqsqwad.tv.data.auth.awaitResult
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit

class NotificationsRepository {
    private val api: ProfileApi by lazy {
        require(!BuildConfig.API_BASE_URL.contains(".invalid")) {
            "The account service is not configured."
        }
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL.trimEnd('/') + "/")
            .client(
                OkHttpClient.Builder()
                    .addInterceptor(FirebaseAppCheckInterceptor())
                    .connectTimeout(15, TimeUnit.SECONDS)
                    .readTimeout(20, TimeUnit.SECONDS)
                    .build(),
            )
            .addConverterFactory(MoshiConverterFactory.create(Moshi.Builder().add(KotlinJsonAdapterFactory()).build()))
            .build()
            .create(ProfileApi::class.java)
    }

    private suspend fun bearer(): String {
        val user = FirebaseAuth.getInstance().currentUser ?: error("Sign in to view notifications.")
        val token = user.getIdToken(false).awaitResult().token ?: error("Your sign-in needs refreshing.")
        return "Bearer $token"
    }

    suspend fun list(): List<AppNotification> = api.notifications(bearer())

    suspend fun markRead(id: String): NotificationReadResponse = api.markNotificationRead(bearer(), id)
}
