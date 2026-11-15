package com.bqsqwad.tv.ui.screens

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import com.bqsqwad.tv.BuildConfig
import com.bqsqwad.tv.data.auth.AuthRepository
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.launch

@Composable
fun SignInScreen(onAuthenticated: () -> Unit) {
    val context = LocalContext.current
    val repository = remember { AuthRepository() }
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var verificationCode by remember { mutableStateOf("") }
    var createAccount by remember { mutableStateOf(false) }
    var verificationPending by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .padding(28.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("BQ SQWAD TV", style = MaterialTheme.typography.headlineLarge)
        Text("Your world. One signal.", color = MaterialTheme.colorScheme.primary)
        Spacer(modifier = Modifier.height(28.dp))
        Text(
            text = if (createAccount) "Create your account" else "Welcome back",
            style = MaterialTheme.typography.titleLarge,
        )
        Spacer(modifier = Modifier.height(14.dp))
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email address") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth(),
            enabled = !verificationPending,
        )
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
            enabled = !verificationPending,
        )
        Spacer(modifier = Modifier.height(12.dp))
        Button(
            enabled = !busy && email.contains("@") && password.length >= 6 && !verificationPending,
            onClick = {
                scope.launch {
                    busy = true
                    message = null
                    try {
                        val result = repository.signInEmail(email, password, createAccount)
                        if (result.emailVerified) {
                            onAuthenticated()
                        } else {
                            verificationPending = true
                            message =
                                if (result.verificationEmailSent) {
                                    "Enter the six-digit code sent to your email."
                                } else {
                                    "Enter the six-digit code sent to your email, or request a new one."
                                }
                        }
                    } catch (error: Exception) {
                        message = error.localizedMessage ?: "Authentication failed."
                    } finally {
                        busy = false
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                if (busy) {
                    "Please wait…"
                } else if (createAccount) {
                    "Create account"
                } else {
                    "Sign in"
                },
            )
        }
        TextButton(
            enabled = !verificationPending,
            onClick = {
                createAccount = !createAccount
                message = null
            },
        ) {
            Text(if (createAccount) "Already have an account? Sign in" else "New here? Create an account")
        }
        TextButton(
            enabled = !busy && email.contains("@") && !verificationPending,
            onClick = {
                scope.launch {
                    busy = true
                    message = null
                    try {
                        repository.sendPasswordReset(email)
                        message = "If the address is registered, a password-reset email has been requested."
                    } catch (error: Exception) {
                        message = error.localizedMessage ?: "Could not request a password reset."
                    } finally {
                        busy = false
                    }
                }
            },
        ) {
            Text("Forgot password?")
        }

        if (verificationPending) {
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = verificationCode,
                onValueChange = { value ->
                    verificationCode = value.filter(Char::isDigit).take(6)
                },
                label = { Text("Six-digit email code") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                enabled = !busy && verificationCode.length == 6,
                onClick = {
                    scope.launch {
                        busy = true
                        message = null
                        try {
                            if (repository.verifyEmailCode(verificationCode)) {
                                verificationPending = false
                                onAuthenticated()
                            } else {
                                message = "The code could not be verified. Request another code."
                            }
                        } catch (error: Exception) {
                            message = error.localizedMessage ?: "Email verification failed."
                        } finally {
                            busy = false
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (busy) "Verifying…" else "Verify email")
            }
            TextButton(
                enabled = !busy,
                onClick = {
                    scope.launch {
                        busy = true
                        message = null
                        try {
                            repository.resendEmailVerification()
                            message = "A new verification code has been requested."
                        } catch (error: Exception) {
                            message = error.localizedMessage ?: "Could not resend the code."
                        } finally {
                            busy = false
                        }
                    }
                },
            ) {
                Text("Resend code")
            }
        }

        OutlinedButton(
            enabled = !busy && !BuildConfig.GOOGLE_WEB_CLIENT_ID.startsWith("REPLACE"),
            onClick = {
                scope.launch {
                    busy = true
                    message = null
                    try {
                        googleSignIn(context, repository)
                        onAuthenticated()
                    } catch (error: Exception) {
                        message = error.localizedMessage ?: "Google sign-in failed."
                    } finally {
                        busy = false
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Continue with Google")
        }
        if (BuildConfig.GOOGLE_WEB_CLIENT_ID.startsWith("REPLACE")) {
            Text(
                text = "Google sign-in needs GOOGLE_WEB_CLIENT_ID from Firebase Authentication settings.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}

private suspend fun googleSignIn(
    context: Context,
    repository: AuthRepository,
) {
    val optionBuilder = GetGoogleIdOption.Builder()
    optionBuilder.setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
    optionBuilder.setFilterByAuthorizedAccounts(false)
    val option = optionBuilder.build()
    val requestBuilder = GetCredentialRequest.Builder()
    requestBuilder.addCredentialOption(option)
    val request = requestBuilder.build()
    val credentialManager = CredentialManager.create(context)
    val result = credentialManager.getCredential(context, request)
    val token =
        GoogleIdTokenCredential
            .createFrom(result.credential.data)
            .idToken
    repository.signInGoogle(token)
}
