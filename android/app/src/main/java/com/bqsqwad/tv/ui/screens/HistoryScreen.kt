package com.bqsqwad.tv.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.bqsqwad.tv.data.currency.CurrencyFormatter
import com.bqsqwad.tv.data.wallet.WalletRepository

@Composable
fun HistoryScreen(onBack: () -> Unit) {
    val repository = remember { WalletRepository() }
    var entries by remember { mutableStateOf(emptyList<com.bqsqwad.tv.data.wallet.LedgerEntry>()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        runCatching { repository.ledger().items.filter { it.kind == "watch_charge" } }
            .onSuccess { entries = it }
            .onFailure { error = "Watch history is temporarily unavailable." }
        loading = false
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Watch history", style = MaterialTheme.typography.headlineSmall)
            TextButton(onClick = onBack) { Text("Back") }
        }
        Text("Your completed viewing sessions", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(12.dp))
        if (loading) CircularProgressIndicator()
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (!loading && error == null && entries.isEmpty()) {
            Text("Your viewing sessions will appear here.", modifier = Modifier.padding(top = 24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
            items(entries, key = { it.id }) { item ->
                Card {
                    ListItem(
                        headlineContent = { Text(item.description) },
                        supportingContent = { Text(item.createdAt) },
                        trailingContent = {
                            Text(
                                CurrencyFormatter.formatMinorUnits(item.amountMinor, item.currency ?: "USD"),
                                color = MaterialTheme.colorScheme.primary,
                                style = MaterialTheme.typography.labelLarge,
                            )
                        },
                    )
                }
            }
        }
    }
}
