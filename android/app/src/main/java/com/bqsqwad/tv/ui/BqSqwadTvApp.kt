package com.bqsqwad.tv.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
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
    val icon: ImageVector,
)

private val mainTabs =
    listOf(
        MainTab("home", "Home", Icons.Default.Home),
        MainTab("live", "Live TV", Icons.Default.LiveTv),
        MainTab("library", "Library", Icons.Default.VideoLibrary),
        MainTab("settings", "Settings", Icons.Default.Settings),
        MainTab("account", "Profile", Icons.Default.Person),
    )

@Composable
fun BqSqwadTvApp(
    themeMode: String = "system",
    onThemeModeChange: (String) -> Unit = {},
) {
    val nav = rememberNavController()
    val auth = remember { AuthRepository() }
    val scope = rememberCoroutineScope()
    val signedInUid = FirebaseAuth.getInstance().currentUser?.uid
    var themeSyncComplete by remember(signedInUid) { mutableStateOf(signedInUid == null) }
    LaunchedEffect(signedInUid) {
        if (signedInUid != null) {
            themeSyncComplete = false
            auth.loadThemePreference()?.let(onThemeModeChange)
        }
        themeSyncComplete = true
    }
    val initialDestination =
        remember {
            if (FirebaseAuth.getInstance().currentUser != null) "home" else "signin"
        }
    val backStackEntry by nav.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val showBottomBar = mainTabs.any { it.route == currentRoute }

    if (!themeSyncComplete) {
        Surface(Modifier.fillMaxSize()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                androidx.compose.foundation.layout.Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    androidx.compose.foundation.Image(
                        painter = painterResource(com.bqsqwad.tv.R.drawable.bq_sqwad_tv_mark),
                        contentDescription = "BQ SQWAD TV",
                        modifier = Modifier.size(104.dp),
                    )
                    CircularProgressIndicator()
                }
            }
        }
        return
    }

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
                                icon = { Icon(tab.icon, contentDescription = tab.label) },
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
                composable("settings") {
                    SettingsScreen(
                        onWallet = { nav.navigate("wallet") },
                        onProfile = { nav.navigate("account") },
                        themeMode = themeMode,
                        onThemeModeChange = { next ->
                            onThemeModeChange(next)
                            scope.launch { runCatching { auth.saveThemePreference(next) } }
                        },
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
