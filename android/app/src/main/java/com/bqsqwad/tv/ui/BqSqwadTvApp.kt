package com.bqsqwad.tv.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.bqsqwad.tv.ui.screens.HomeScreen
import com.bqsqwad.tv.ui.screens.SignInScreen

@Composable fun BqSqwadTvApp() {
 val nav=rememberNavController()
 Surface(Modifier.fillMaxSize()) {
  NavHost(navController=nav,startDestination="signin") {
   composable("signin") { SignInScreen { nav.navigate("home") } }
   composable("home") { HomeScreen() }
  }
 }
}
