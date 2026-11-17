package com.bqsqwad.tv.data.session
import android.content.Context
import com.bqsqwad.tv.BuildConfig
import com.bqsqwad.tv.data.auth.awaitResult
import com.bqsqwad.tv.data.security.FirebaseAppCheckInterceptor
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import com.google.firebase.auth.FirebaseAuth
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

class SessionRepository {
    private val leaseTokens = ConcurrentHashMap<String, String>()
    private val api: SessionApi by lazy {
        require(
            !BuildConfig.API_BASE_URL.contains(".invalid"),
        ) { "Session API is not configured. Set API_BASE_URL in android/local.properties." }
        Retrofit
            .Builder()
            .baseUrl(BuildConfig.API_BASE_URL.trimEnd('/') + "/")
            .client(
                OkHttpClient
                    .Builder()
                    .addInterceptor(FirebaseAppCheckInterceptor())
                    .connectTimeout(15, TimeUnit.SECONDS)
                    .readTimeout(20, TimeUnit.SECONDS)
                    .build(),
            ).addConverterFactory(
                MoshiConverterFactory.create(Moshi.Builder().add(KotlinJsonAdapterFactory()).build()),
            ).build()
            .create(SessionApi::class.java)
    }

    private suspend fun bearer(): String {
        val user = FirebaseAuth.getInstance().currentUser ?: error("Sign in is required to watch.")
        val token = user.getIdToken(false).awaitResult().token ?: error("Could not refresh your sign-in token.")
        return "Bearer " + token
    }

    suspend fun start(
        context: Context,
        channelId: String,
    ): SessionSnapshot {
        val auth = bearer()
        val nonce = api.integrityChallenge(auth).nonce
        val integrity =
            IntegrityManagerFactory
                .create(context)
                .requestIntegrityToken(IntegrityTokenRequest.builder().setNonce(nonce).build())
                .awaitResult()
                .token()
        val session = api.start(auth, StartSessionRequest(channelId, integrity, nonce, UUID.randomUUID().toString(), "android"))
        leaseTokens[session.sessionId] = requireNotNull(session.leaseToken) {
            "The playback service did not return a secure session lease."
        }
        return session
    }

    suspend fun heartbeat(
        sessionId: String,
        sequence: Long,
        playbackState: String,
        playbackPositionMs: Long,
    ) : SessionSnapshot {
        val leaseToken = requireNotNull(leaseTokens[sessionId]) {
            "The secure playback lease expired. Restart playback to continue."
        }
        val response = api.heartbeat(
            bearer(),
            sessionId,
            HeartbeatRequest(sequence, playbackState, playbackPositionMs, leaseToken),
        )
        if (response.active) {
            leaseTokens[sessionId] = requireNotNull(response.leaseToken) {
                "The playback service did not renew the secure session lease."
            }
        } else {
            leaseTokens.remove(sessionId)
        }
        return response
    }

    suspend fun refresh(sessionId: String) = api.refresh(bearer(), sessionId)

    suspend fun end(sessionId: String) {
        try { api.end(bearer(), sessionId) } finally { leaseTokens.remove(sessionId) }
    }
}
