package com.bqsqwad.tv.data.auth

import com.bqsqwad.tv.BuildConfig
import com.bqsqwad.tv.data.security.FirebaseAppCheckInterceptor
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit

data class EmailAuthResult(
    val emailVerified: Boolean,
    val verificationEmailSent: Boolean,
)

class AuthRepository(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
) {
    private val profileApi: ProfileApi by lazy {
        require(!BuildConfig.API_BASE_URL.contains(".invalid")) {
            "Set API_BASE_URL in android/local.properties to the deployed BQ SQWAD TV API."
        }
        val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
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
            ).addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(ProfileApi::class.java)
    }

    private suspend fun currentBearerToken(): String {
        val user = auth.currentUser ?: error("Sign in before continuing.")
        val token = user.getIdToken(false).awaitResult().token
        return "Bearer " + (token ?: error("Could not obtain a Firebase authentication token."))
    }

    suspend fun signInEmail(
        email: String,
        password: String,
        createAccount: Boolean,
    ): EmailAuthResult {
        val normalizedEmail = email.trim()
        val user =
            if (createAccount) {
                auth.createUserWithEmailAndPassword(normalizedEmail, password).awaitResult().user
            } else {
                auth.signInWithEmailAndPassword(normalizedEmail, password).awaitResult().user
            } ?: error("Firebase did not return an authenticated account.")

        user.reload().awaitResult()
        val verified = user.isEmailVerified
        val verification =
            if (verified) {
                null
            } else {
                profileApi.sendEmailVerificationCode(currentBearerToken())
            }
        return EmailAuthResult(
            emailVerified = verified || verification?.alreadyVerified == true,
            verificationEmailSent = verification?.sent == true,
        )
    }

    suspend fun resendEmailVerification(): Boolean {
        val user = auth.currentUser ?: error("Sign in before requesting email verification.")
        user.reload().awaitResult()
        if (user.isEmailVerified) return true
        val response = profileApi.sendEmailVerificationCode(currentBearerToken())
        return response.alreadyVerified == true
    }

    suspend fun verifyEmailCode(code: String): Boolean {
        require(Regex("^\\d{6}$").matches(code)) { "Enter the six-digit code from your email." }
        val result =
            profileApi.verifyEmailCode(
                currentBearerToken(),
                VerifyEmailOtpRequest(code),
            )
        return result.verified
    }

    suspend fun sendPasswordReset(email: String) {
        require(email.trim().isNotEmpty()) { "Enter your email address first." }
        auth.sendPasswordResetEmail(email.trim()).awaitResult()
    }

    suspend fun signInGoogle(idToken: String) {
        val credential = GoogleAuthProvider.getCredential(idToken, null)
        auth.signInWithCredential(credential).awaitResult()
    }

    suspend fun completeProfile(
        dateOfBirth: String,
        parentalPin: String?,
    ): CompleteProfileResponse =
        profileApi.completeProfile(
            currentBearerToken(),
            CompleteProfileRequest(dateOfBirth, parentalPin),
        )

    fun signOut() = auth.signOut()
}
