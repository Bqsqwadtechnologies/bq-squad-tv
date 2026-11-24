package com.bqsqwad.tv.ui.screens
import com.bqsqwad.tv.ui.ErrorMessages

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.ui.Alignment
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.bqsqwad.tv.data.auth.AuthRepository
import kotlinx.coroutines.launch
import java.time.LocalDate

@Composable
fun ProfileSetupScreen(
    repository: AuthRepository,
    onComplete: (Boolean) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current
    var legalAccepted by remember { mutableStateOf(false) }
    var dob by remember { mutableStateOf("") }
    var profileAlreadyComplete by remember { mutableStateOf(false) }
    var pin by remember { mutableStateOf("") }
    LaunchedEffect(Unit) {
        profileAlreadyComplete = runCatching { repository.isProfileComplete() }.getOrDefault(false)
    }
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
        Text("A little about you", style = MaterialTheme.typography.headlineMedium)
        Text("Your country and wallet currency are detected automatically. Enter your date of birth to finish setting up your account.")
        Spacer(Modifier.height(16.dp))
        Spacer(Modifier.height(12.dp))
        if (!profileAlreadyComplete) {
            OutlinedTextField(
                dob,
                { dob = it },
                label = { Text("Date of birth (YYYY-MM-DD)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(8.dp))
        }
        OutlinedTextField(
            pin,
            {
                pin = it.filter(Char::isDigit).take(6)
            },
            label = {
                Text("Optional parental PIN (4–6 digits)")
            },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions =
                KeyboardOptions(
                    keyboardType = KeyboardType.NumberPassword,
                ),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(16.dp))
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Checkbox(checked = legalAccepted, onCheckedChange = { legalAccepted = it })
            Text("I have read and accept the ")
            TextButton(onClick = { uriHandler.openUri("https://tv.bqsqwad.com/legal/terms") }) { Text("Terms") }
            Text(" and ")
            TextButton(onClick = { uriHandler.openUri("https://tv.bqsqwad.com/legal/privacy-policy") }) { Text("Privacy Policy") }
        }
        Button(enabled = !busy && legalAccepted && (profileAlreadyComplete || dob.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) && (pin.isBlank() || pin.length in 4..6), onClick = {
            scope.launch {
                busy = true
                message = null
                runCatching {
                    val date = LocalDate.parse(dob)
                    require(!date.isAfter(LocalDate.now())) { "Date of birth cannot be in the future." }
                    require(repository.acceptLegalPages()) { "Please accept the current Terms and Privacy Policy before continuing." }
                    if (!profileAlreadyComplete) repository.completeProfile(date.toString(), pin.ifBlank { null })
                }.onSuccess { response ->
                    if (response.profileComplete) {
                        onComplete(response.adultEligible)
                    } else {
                        message = "Your profile could not be verified. Please try again."
                    }
                }.onFailure { message = it.message ?: ErrorMessages.PROFILE_FAILED }
                busy = false
            }
        }, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Verifying…" else "Continue to BQ SQWAD TV") }
        message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Text(
            "Adult content is never enabled by this screen. The server must confirm eligibility for every protected catalog and playback request.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
