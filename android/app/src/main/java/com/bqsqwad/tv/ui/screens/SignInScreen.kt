package com.bqsqwad.tv.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable fun SignInScreen(onContinue: () -> Unit) {
 Column(Modifier.fillMaxSize().padding(28.dp),verticalArrangement=Arrangement.Center,horizontalAlignment=Alignment.Start) {
  Text("BQ SQWAD TV",style=MaterialTheme.typography.headlineLarge)
  Text("Your world. One signal.",color=MaterialTheme.colorScheme.primary)
  Spacer(Modifier.height(28.dp))
  Text("Sign in to continue",style=MaterialTheme.typography.titleLarge)
  Spacer(Modifier.height(16.dp))
  Button(onClick=onContinue) { Text("Continue with Google") }
  Spacer(Modifier.height(10.dp))
  OutlinedButton(onClick=onContinue) { Text("Continue with email") }
  Text("Authentication will be connected before production account access is enabled.",color=MaterialTheme.colorScheme.onSurfaceVariant)
 }
}
