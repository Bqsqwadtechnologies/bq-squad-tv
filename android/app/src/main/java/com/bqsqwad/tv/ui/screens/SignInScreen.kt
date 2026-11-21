package com.bqsqwad.tv.ui.screens
import com.bqsqwad.tv.ui.ErrorMessages

import android.content.Context
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import com.bqsqwad.tv.data.auth.AuthRepository
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.launch

@Composable
fun SignInScreen(onAuthenticated: () -> Unit) {
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val repository = remember { AuthRepository() }
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var verificationCode by remember { mutableStateOf("") }
    var createAccount by remember { mutableStateOf(false) }
    var verificationPending by remember { mutableStateOf(false) }
    var legalAcceptancePending by remember { mutableStateOf(false) }
    var legalConsentChecked by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var googleClientId by remember { mutableStateOf("") }
    var googleConfigLoading by remember { mutableStateOf(true) }
    var googleConfigError by remember { mutableStateOf(false) }

    fun loadGoogleConfig() {
        scope.launch {
            googleConfigLoading = true
            googleConfigError = false
            runCatching { repository.googleWebClientId() }
                .onSuccess { googleClientId = it }
                .onFailure { googleConfigError = true; googleClientId = "" }
            googleConfigLoading = false
        }
    }

    LaunchedEffect(Unit) { loadGoogleConfig() }

    suspend fun continueAfterLegalCheck() {
        if (repository.needsLegalAcceptance()) {
            legalAcceptancePending = true
            legalConsentChecked = false
        } else {
            onAuthenticated()
        }
    }

    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .padding(28.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Image(
            painter = painterResource(com.bqsqwad.tv.R.drawable.bq_sqwad_tv_mark),
            contentDescription = "BQ SQWAD TV logo",
            modifier = Modifier
                .align(Alignment.CenterHorizontally)
                .size(112.dp),
        )
        Spacer(modifier = Modifier.height(28.dp))
        Text(
            text = if (createAccount) "Create your account" else "Welcome back",
            style = MaterialTheme.typography.titleLarge,
        )
        Spacer(modifier = Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = { uriHandler.openUri("https://tv.bqsqwad.com/legal/terms") }) { Text("Terms of service") }
            TextButton(onClick = { uriHandler.openUri("https://tv.bqsqwad.com/legal/privacy-policy") }) { Text("Privacy notice") }
        }
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
        Spacer(modifier = Modifier.height(10.dp))
        if (googleClientId.isNotBlank()) {
            OutlinedButton(
                enabled = !busy && !verificationPending && (!createAccount || legalConsentChecked),
                onClick = {
                    scope.launch {
                        busy = true
                        message = null
                        try {
                            if (createAccount) {
                                require(legalConsentChecked) { "Read and accept the Terms and Privacy Policy first." }
                                repository.ensurePublicLegalPagesPublished()
                            }
                            googleSignIn(context, repository, googleClientId)
                            if (createAccount) {
                                repository.acceptLegalPages()
                                onAuthenticated()
                            } else {
                                continueAfterLegalCheck()
                            }
                        } catch (error: Exception) {
                            message = error.message?.takeIf { it.isNotBlank() } ?: ErrorMessages.SIGN_IN_FAILED
                        } finally {
                            busy = false
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Continue with Google")
            }
        } else {
            OutlinedButton(
                enabled = false,
                onClick = {},
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (googleConfigLoading) "Google sign-in loading…" else "Google sign-in not configured")
            }
            if (googleConfigError || (!googleConfigLoading && googleClientId.isBlank())) {
                TextButton(onClick = { loadGoogleConfig() }, enabled = !googleConfigLoading) {
                    Text(if (googleConfigLoading) "Checking…" else "Google sign-in unavailable. Tap to retry.")
                }
            }
        }
        Spacer(modifier = Modifier.height(12.dp))
        Button(
            enabled = !busy && email.contains("@") && password.length >= 6 && !verificationPending && (!createAccount || legalConsentChecked),
            onClick = {
                scope.launch {
                    busy = true
                    message = null
                    try {
                        if (createAccount) {
                            require(legalConsentChecked) { "Read and accept the Terms and Privacy Policy first." }
                            repository.ensurePublicLegalPagesPublished()
                        }
                        val result = repository.signInEmail(email, password, createAccount)
                        if (result.emailVerified) {
                            if (createAccount) {
                                repository.acceptLegalPages()
                                onAuthenticated()
                            } else {
                                continueAfterLegalCheck()
                            }
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
                        message = ErrorMessages.SIGN_IN_FAILED
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
                legalConsentChecked = false
                message = null
            },
        ) {
            Text(if (createAccount) "Already have an account? Sign in" else "New here? Create an account")
        }
        if (createAccount) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = legalConsentChecked, onCheckedChange = { legalConsentChecked = it }, enabled = !busy)
                Text("I have read and accept the Terms of service and Privacy Policy.", style = MaterialTheme.typography.bodySmall)
            }
        }
        if (legalAcceptancePending) {
            Spacer(modifier = Modifier.height(12.dp))
            Text("Please review the updated service terms before continuing.", style = MaterialTheme.typography.bodyMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = { uriHandler.openUri("https://tv.bqsqwad.com/legal/terms") }) { Text("Terms") }
                TextButton(onClick = { uriHandler.openUri("https://tv.bqsqwad.com/legal/privacy-policy") }) { Text("Privacy Policy") }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = legalConsentChecked, onCheckedChange = { legalConsentChecked = it }, enabled = !busy)
                Text("I have reviewed and accept the current versions.", style = MaterialTheme.typography.bodySmall)
            }
            Button(
                enabled = !busy && legalConsentChecked,
                onClick = {
                    scope.launch {
                        busy = true
                        message = null
                        try {
                            repository.acceptLegalPages()
                            legalAcceptancePending = false
                            onAuthenticated()
                        } catch (error: Exception) {
                            message = error.message ?: "Your acceptance could not be saved."
                        } finally { busy = false }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (busy) "Saving…" else "Accept and continue") }
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
                        message = ErrorMessages.PASSWORD_RESET_FAILED
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
                                if (createAccount) {
                                    repository.acceptLegalPages()
                                    onAuthenticated()
                                } else {
                                    continueAfterLegalCheck()
                                }
                            } else {
                                message = "The code could not be verified. Request another code."
                            }
                        } catch (error: Exception) {
                            message = error.message?.takeIf { it.isNotBlank() } ?: ErrorMessages.VERIFICATION_FAILED
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
                            val alreadyVerified = repository.resendEmailVerification()
                            if (alreadyVerified) {
                                verificationPending = false
                                onAuthenticated()
                            } else {
                                message = "A new verification code has been requested."
                            }
                        } catch (error: Exception) {
                            message = ErrorMessages.VERIFICATION_FAILED
                        } finally {
                            busy = false
                        }
                    }
                },
            ) {
                Text("Resend code")
            }
        }

        message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}

private suspend fun googleSignIn(
    context: Context,
    repository: AuthRepository,
    clientId: String,
) {
    require(clientId.isNotBlank()) { "Google sign-in is unavailable. Try again later." }
    val optionBuilder = GetGoogleIdOption.Builder()
    optionBuilder.setServerClientId(clientId)
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
