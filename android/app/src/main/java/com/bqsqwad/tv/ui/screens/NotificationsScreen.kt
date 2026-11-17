package com.bqsqwad.tv.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.bqsqwad.tv.data.auth.AppNotification
import com.bqsqwad.tv.data.notifications.NotificationsRepository
import kotlinx.coroutines.launch

@Composable
fun NotificationsScreen(onBack: () -> Unit) {
    val repository = remember { NotificationsRepository() }
    val scope = rememberCoroutineScope()
    var entries by remember { mutableStateOf(emptyList<AppNotification>()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        runCatching { repository.list() }
            .onSuccess { entries = it }
            .onFailure { error = "Notifications are temporarily unavailable." }
        loading = false
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Notifications", style = MaterialTheme.typography.headlineSmall)
            TextButton(onClick = onBack) { Text("Back") }
        }
        Text("Updates about your account and viewing activity", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(12.dp))
        if (loading) CircularProgressIndicator()
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (!loading && error == null && entries.isEmpty()) {
            Text("New account updates will appear here.", modifier = Modifier.padding(top = 24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
            items(entries, key = { it.id }) { item ->
                Card {
                    Column {
                        ListItem(
                            headlineContent = { Text(item.title, fontWeight = if (item.read) androidx.compose.ui.text.font.FontWeight.Normal else androidx.compose.ui.text.font.FontWeight.Bold) },
                            supportingContent = { Text(item.body) },
                            trailingContent = { if (!item.read) Text("NEW", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall) },
                        )
                        if (!item.read) {
                            TextButton(
                                onClick = {
                                    scope.launch {
                                        runCatching { repository.markRead(item.id) }
                                            .onSuccess { entries = entries.map { current -> if (current.id == item.id) current.copy(read = true) else current } }
                                            .onFailure { error = "This notification could not be marked as read." }
                                    }
                                },
                                modifier = Modifier.padding(start = 8.dp, bottom = 4.dp),
                            ) { Text("Mark as read") }
                        }
                    }
                }
            }
        }
    }
}
