package com.bqsqwad.tv.data.security

import com.google.android.gms.tasks.Tasks
import com.google.firebase.appcheck.FirebaseAppCheck
import okhttp3.Interceptor
import okhttp3.Response
import java.util.concurrent.TimeUnit

/**
 * Adds Play Integrity-backed Firebase App Check attestation to authenticated API calls.
 * The server rollout flag remains disabled until the web and Android providers are registered.
 */
class FirebaseAppCheckInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val appCheckToken =
            runCatching {
                Tasks.await(
                    FirebaseAppCheck.getInstance().getAppCheckToken(false),
                    3,
                    TimeUnit.SECONDS,
                ).token
            }.getOrNull()

        val request =
            chain
                .request()
                .newBuilder()
                .apply {
                    if (!appCheckToken.isNullOrBlank()) {
                        header("X-Firebase-AppCheck", appCheckToken)
                    }
                }.build()
        return chain.proceed(request)
    }
}
