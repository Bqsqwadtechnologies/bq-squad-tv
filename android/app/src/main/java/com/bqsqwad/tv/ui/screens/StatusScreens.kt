package com.bqsqwad.tv.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.HourglassTop
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
private fun BqStatusScreen(
    title: String,
    message: String,
    icon: ImageVector,
    actionLabel: String,
    onAction: () -> Unit,
) {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            Modifier.fillMaxWidth().padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(48.dp))
            Spacer(Modifier.height(18.dp))
            Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text(message, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(22.dp))
            Button(onClick = onAction, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text(actionLabel)
            }
        }
    }
}

@Composable
fun MaintenanceScreen(onRetry: () -> Unit) {
    BqStatusScreen(
        title = "We’ll be back soon",
        message = "BQ SQWAD TV is temporarily unavailable while we make improvements. Please try again shortly.",
        icon = Icons.Default.Info,
        actionLabel = "Try again",
        onAction = onRetry,
    )
}

@Composable
fun OfflineScreen(onRetry: () -> Unit) {
    BqStatusScreen(
        title = "You're offline",
        message = "Check your internet connection, then try loading BQ SQWAD TV again.",
        icon = Icons.Default.WifiOff,
        actionLabel = "Try again",
        onAction = onRetry,
    )
}

@Composable
fun HighDemandScreen(onRetry: () -> Unit) {
    BqStatusScreen(
        title = "A lot of people are watching",
        message = "We’re experiencing high demand right now. Please wait a moment and try again.",
        icon = Icons.Default.HourglassTop,
        actionLabel = "Try again",
        onAction = onRetry,
    )
}

@Composable
fun CountryUnavailableScreen(onBack: () -> Unit) {
    BqStatusScreen(
        title = "Not available in your country",
        message = "This programme is not currently licensed for viewing in your country.",
        icon = Icons.Default.Public,
        actionLabel = "Go back",
        onAction = onBack,
    )
}

@Composable
fun AgeRestrictionScreen(onBack: () -> Unit) {
    BqStatusScreen(
        title = "Age restriction",
        message = "This programme has an age restriction. Browse content available for your account.",
        icon = Icons.Default.Lock,
        actionLabel = "Go back",
        onAction = onBack,
    )
}

@Composable
fun LegalNoticeScreen(
    title: String,
    message: String = "This document is being prepared for publication. Please contact tv@bqsqwad.com if you need assistance.",
    onBack: () -> Unit,
) {
    BqStatusScreen(
        title = title,
        message = message,
        icon = Icons.Default.Info,
        actionLabel = "Go back",
        onAction = onBack,
    )
}
