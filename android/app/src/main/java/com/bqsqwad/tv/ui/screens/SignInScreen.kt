package com.bqsqwad.tv.ui.screens

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
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
    var createAccount by remember { mutableStateOf(false) }
    var verificationPending by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    Column(
        Modifier.fillMaxSize().padding(28.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("BQ SQWAD TV", style = MaterialTheme.typography.headlineLarge)
        Text("Your world. One signal.", color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(28.dp))
        Text(
            if (createAccount) "Create your account" else "Welcome back",
            style = MaterialTheme.typography.titleLarge,
        )
        Spacer(Modifier.height(14.dp))
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email address") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
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
                            message = "Check your inbox for the verification link, then return here."
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
            Text(if (busy) "Please wait…" else if (createAccount) "Create account" else "Sign in")
        }
        TextButton(
            onClick = {
                createAccount = !createAccount
                message = null
                verificationPending = false
            },
        ) {
            Text(if (createAccount) "Already have an account? Sign in" else "New here? Create an account")
        }
        TextButton(
            enabled = !busy && email.contains("@"),
            onClick = {
                scope.launch {
                    busy = true
                    message = null
                    try {
                        repository.sendPasswordReset(email)
                        message = "If the address is registered, a password-reset email has been sent."
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
            OutlinedButton(
                enabled = !busy,
                onClick = {
                    scope.launch {
                        busy = true
                        try {
                            if (repository.isCurrentEmailVerified()) {
                                verificationPending = false
                                onAuthenticated()
                            } else {
                                message = "Your email is not verified yet. Open the verification link first."
                            }
                        } catch (error: Exception) {
                            message = error.localizedMessage ?: "Could not check email verification."
                        } finally {
                            busy = false
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("I've verified my email")
            }
            TextButton(
                enabled = !busy,
                onClick = {
                    scope.launch {
                        busy = true
                        try {
                            repository.resendEmailVerification()
                            message = "A new verification email has been requested."
                        } catch (error: Exception) {
                            message = error.localizedMessage ?: "Could not resend verification email."
                        } finally {
                            busy = false
                        }
                    }
                },
            ) {
                Text("Resend verification email")
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
                "Google sign-in needs GOOGLE_WEB_CLIENT_ID from Firebase Authentication settings.",
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
    val option = GetGoogleIdOption.Builder()
        .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
        .setFilterByAuthorizedAccounts(false)
        .build()
    val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
    val credentialManager = CredentialManager.create(context)
    val result = credentialManager.getCredential(context, request)
    val token = GoogleIdTokenCredential.createFrom(result.credential.data).idToken
    repository.signInGoogle(token)
}
