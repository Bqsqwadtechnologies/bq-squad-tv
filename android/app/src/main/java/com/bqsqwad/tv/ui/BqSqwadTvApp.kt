package com.bqsqwad.tv.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import com.bqsqwad.tv.data.auth.AuthRepository
import com.bqsqwad.tv.ui.player.PlayerScreen
import com.bqsqwad.tv.ui.screens.*
import com.google.firebase.auth.FirebaseAuth

private data class MainTab(
    val route: String,
    val label: String,
    val symbol: String,
)

private val mainTabs =
    listOf(
        MainTab("home", "Home", "⌂"),
        MainTab("live", "Live TV", "▣"),
        MainTab("library", "Library", "▦"),
        MainTab("downloads", "Downloads", "↓"),
        MainTab("settings", "Settings", "⚙"),
        MainTab("account", "Profile", "●"),
    )

@Composable
fun BqSqwadTvApp() {
    val nav = rememberNavController()
    val auth = remember { AuthRepository() }
    val initialDestination =
        remember {
            if (FirebaseAuth.getInstance().currentUser != null) "home" else "signin"
        }
    val backStackEntry by nav.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val showBottomBar = mainTabs.any { it.route == currentRoute }

    Surface(Modifier.fillMaxSize()) {
        Scaffold(
            bottomBar = {
                if (showBottomBar) {
                    NavigationBar {
                        mainTabs.forEach { tab ->
                            NavigationBarItem(
                                selected = currentRoute == tab.route,
                                onClick = {
                                    nav.navigate(tab.route) {
                                        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                },
                                icon = { Text(tab.symbol) },
                                label = { Text(tab.label) },
                            )
                        }
                    }
                }
            },
        ) { padding ->
            NavHost(
                navController = nav,
                startDestination = initialDestination,
                modifier = Modifier.fillMaxSize().padding(padding),
            ) {
                composable("signin") {
                    SignInScreen {
                        nav.navigate("profile-setup") {
                            popUpTo("signin") { inclusive = true }
                        }
                    }
                }
                composable("profile-setup") {
                    ProfileSetupScreen(auth) {
                        nav.navigate("home") { popUpTo("profile-setup") { inclusive = true } }
                    }
                }
                composable("home") {
                    HomeScreen(
                        onSearch = { nav.navigate("search") },
                        onChannel = { nav.navigate("channel/$it") },
                        onWallet = { nav.navigate("wallet") },
                        onProfile = { nav.navigate("account") },
                        onProducer = { nav.navigate("producer") },
                        onLive = { nav.navigate("live") },
                        onLibrary = { nav.navigate("library") },
                    )
                }
                composable("live") {
                    LiveTvScreen(onChannel = { nav.navigate("channel/$it") })
                }
                composable("library") {
                    LibraryScreen(onChannel = { nav.navigate("channel/$it") })
                }
                composable("downloads") { DownloadsScreen() }
                composable("settings") {
                    SettingsScreen(
                        onWallet = { nav.navigate("wallet") },
                        onProfile = { nav.navigate("account") },
                    )
                }
                composable("account") {
                    AccountScreen(
                        onWallet = { nav.navigate("wallet") },
                        onProducer = { nav.navigate("producer") },
                        onSettings = { nav.navigate("settings") },
                        onSignOut = {
                            FirebaseAuth.getInstance().signOut()
                            nav.navigate("signin") { popUpTo(0) }
                        },
                    )
                }
                composable("search") {
                    SearchScreen(onBack = { nav.popBackStack() }, onChannel = { nav.navigate("channel/$it") })
                }
                composable("channel/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
                    ChannelScreen(
                        entry.arguments?.getString("id").orEmpty(),
                        onBack = { nav.popBackStack() },
                        onPlay = { nav.navigate("player/$it") },
                    )
                }
                composable("player/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
                    PlayerScreen(
                        entry.arguments?.getString("id").orEmpty(),
                        onExit = { nav.popBackStack() },
                        onTopUp = { nav.navigate("wallet") },
                    )
                }
                composable("wallet") { WalletScreen(onBack = { nav.popBackStack() }) }
                composable("producer") { ProducerScreen(onBack = { nav.popBackStack() }) }
            }
        }
    }
}
