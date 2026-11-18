package com.bqsqwad.tv.ui.screens

import androidx.compose.foundation.Image
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bqsqwad.tv.R

@Composable
private fun BqStatusScreen(
    title: String,
    message: String,
    icon: ImageVector? = null,
    actionLabel: String,
    onAction: () -> Unit,
) {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            Modifier.fillMaxWidth().padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Image(
                painter = painterResource(id = R.drawable.bq_sqwad_tv_mark),
                contentDescription = "BQ SQWAD TV",
                modifier = Modifier.size(56.dp)
            )
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
fun OfflineScreen(onRetry: () -> Unit) =
    BqStatusScreen("You're offline", "Check your internet connection and try again.", Icons.Default.WifiOff, "Retry", onRetry)

@Composable
fun MaintenanceScreen(onRetry: () -> Unit) =
    BqStatusScreen("Under maintenance", "We're making updates. Back shortly.", Icons.Default.HourglassTop, "Refresh", onRetry)

@Composable
fun NotAvailableScreen(onRetry: () -> Unit) =
    BqStatusScreen("Not available", "This channel or title isn't available right now.", Icons.Default.Public, "Explore other channels", onRetry)

@Composable
fun AgeRestrictedScreen(onDismiss: () -> Unit) =
    BqStatusScreen("Age restricted", "This content requires adult verification.", Icons.Default.Lock, "Go back", onDismiss)

@Composable
fun HighDemandScreen(onRetry: () -> Unit) =
    BqStatusScreen("High demand", "Servers are currently busy. Please wait a moment.", Icons.Default.Info, "Try again", onRetry)
