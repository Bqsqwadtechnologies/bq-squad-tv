package com.bqsqwad.tv.ui.screens

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable fun HomeScreen() {
 Column(Modifier.fillMaxSize().padding(20.dp)) {
  Text("BQ SQWAD TV",style=MaterialTheme.typography.headlineMedium)
  Text("LIVE ENTERTAINMENT",color=MaterialTheme.colorScheme.primary,style=MaterialTheme.typography.labelMedium)
  Spacer(Modifier.height(24.dp))
  Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(20.dp)) {
   Text("THE LIVE SIGNAL",color=MaterialTheme.colorScheme.secondary)
   Text("Every moment, in real time.",style=MaterialTheme.typography.headlineSmall)
   Text("Connect the catalog service to discover live channels and events.")
  } }
  Spacer(Modifier.height(22.dp))
  Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
   listOf("All","Football","Movies","News","Shows","Replays").forEach { AssistChip(onClick={},label={Text(it)}) }
  }
  Spacer(Modifier.height(20.dp))
  Text("Live now",style=MaterialTheme.typography.titleLarge)
  Text("Live channels will appear when the catalog API is configured.",color=MaterialTheme.colorScheme.onSurfaceVariant)
  Spacer(Modifier.height(20.dp))
  Text("Starting soon",style=MaterialTheme.typography.titleLarge)
  Text("Match reminders and schedules will load from the shared catalog.",color=MaterialTheme.colorScheme.onSurfaceVariant)
 }
}
