package com.bqsqwad.tv.ui.screens
import com.bqsqwad.tv.ui.ErrorMessages

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items as listItems
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.bqsqwad.tv.data.catalog.CatalogHomeResponse
import com.bqsqwad.tv.data.catalog.CatalogRepository
import com.bqsqwad.tv.data.catalog.ChannelSummary
import com.bqsqwad.tv.ui.components.SqwadAvatar
import com.google.firebase.auth.FirebaseAuth

@Composable
fun LiveTvScreen(onChannel: (String) -> Unit) {
    val context = LocalContext.current
    val repository = remember(context) { CatalogRepository(context) }
    var catalog by remember { mutableStateOf<CatalogHomeResponse?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        runCatching { repository.home() }
            .onSuccess { catalog = it }
            .onFailure { error = ErrorMessages.TRY_AGAIN }
        loading = false
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 18.dp, vertical = 16.dp)) {
        Text("Live TV", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)
        Text("Watch channels that are live now.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(14.dp))
        when {
            loading -> LinearProgressIndicator(Modifier.fillMaxWidth())
            error != null -> Text(error.orEmpty(), color = MaterialTheme.colorScheme.error)
            catalog?.liveNow.isNullOrEmpty() && catalog?.channels.isNullOrEmpty() ->
                EmptyPanel(
                    symbol = "▣",
                    title = "No live channels yet",
                    message = "Published and licensed channels will appear here.",
                )
            else ->
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    val channels = (catalog?.liveNow.orEmpty() + catalog?.channels.orEmpty()).distinctBy { it.id }
                    listItems(channels, key = { it.id }) { channel ->
                        ChannelListCard(channel = channel, onClick = { onChannel(channel.id) })
                    }
                }
        }
    }
}

@Composable
fun LibraryScreen(onChannel: (String) -> Unit = {}) {
    val context = LocalContext.current
    val repository = remember(context) { CatalogRepository(context) }
    var selected by remember { mutableStateOf("All") }
    var channels by remember { mutableStateOf<List<ChannelSummary>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    val categories = listOf("All", "Movies", "Series", "Sports", "Kids", "News", "Entertainment")

    LaunchedEffect(Unit) {
        runCatching { repository.home() }
            .onSuccess { response ->
                val combinedChannels = response.channels + response.trending + response.replays
                channels = combinedChannels.distinctBy { it.id }
            }.onFailure {
                error = ErrorMessages.TRY_AGAIN
            }
        loading = false
    }

    val visibleChannels =
        channels.filter { channel ->
            selected == "All" ||
                channel.category.equals(selected, ignoreCase = true) ||
                (selected == "Movies" && channel.category.contains("movie", ignoreCase = true))
        }

    Column(Modifier.fillMaxSize().padding(18.dp)) {
        Text("Library", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)
        Text("Browse published channels and available programmes.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(16.dp))
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            categories.forEach { category ->
                FilterChip(
                    selected = selected == category,
                    onClick = { selected = category },
                    label = { Text(category) },
                )
            }
        }
        Spacer(Modifier.height(14.dp))
        when {
            loading -> LinearProgressIndicator(Modifier.fillMaxWidth())
            error != null ->
                EmptyPanel(
                    symbol = "!",
                    title = "Library unavailable",
                    message = error.orEmpty(),
                )
            visibleChannels.isEmpty() ->
                EmptyPanel(
                    symbol = if (selected == "Series") "▤" else "▣",
                    title = if (selected == "All") "No published channels yet" else "No $selected channels yet",
                    message = "Published channels appear here after their distribution rights are verified.",
                )
            else ->
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = PaddingValues(bottom = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    gridItems(visibleChannels.size, key = { index -> visibleChannels[index].id }) { index ->
                        val channel = visibleChannels[index]
                        Card(
                            modifier = Modifier.fillMaxWidth().clickable { onChannel(channel.id) },
                            shape = RoundedCornerShape(18.dp),
                        ) {
                            Column {
                                if (!channel.posterUrl.isNullOrBlank()) {
                                    AsyncImage(
                                        model = channel.posterUrl,
                                        contentDescription = channel.title,
                                        modifier = Modifier.fillMaxWidth().aspectRatio(3f / 4f),
                                        contentScale = ContentScale.Crop,
                                    )
                                } else {
                                    Box(
                                        Modifier.fillMaxWidth().aspectRatio(3f / 4f)
                                            .background(Brush.linearGradient(listOf(Color(0xFF1459B8), Color(0xFF07143D)))),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Text("BQ SQWAD TV", color = Color.White, fontWeight = FontWeight.Black)
                                    }
                                }
                                Column(Modifier.padding(10.dp)) {
                                    Text(channel.title, maxLines = 2, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                                    Text(channel.category, maxLines = 1, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }
                }
        }
    }
}

@Composable
fun SettingsScreen(
    onWallet: () -> Unit,
    onProfile: () -> Unit,
    themeMode: String = "system",
    onThemeModeChange: (String) -> Unit = {},
    onNotifications: () -> Unit = {},
) {
    val uriHandler = LocalUriHandler.current
    var quality by remember { mutableStateOf("Auto") }
    Column(Modifier.fillMaxSize().padding(18.dp)) {
        Text("Settings", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(18.dp))
        Text("Appearance", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text("Choose how BQ SQWAD TV looks on this device.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            listOf("system" to "System", "light" to "Light", "dark" to "Dark").forEach { (value, label) ->
                FilterChip(
                    selected = themeMode == value,
                    onClick = { onThemeModeChange(value) },
                    label = { Text(label) },
                )
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Spacer(Modifier.height(14.dp))
        ListItem(
            headlineContent = { Text("Notifications") },
            supportingContent = { Text("View recent account and programme updates") },
            modifier = Modifier.clickable(onClick = onNotifications),
        )
        ListItem(
            headlineContent = { Text("Playback quality") },
            supportingContent = { Text(quality) },
            trailingContent = {
                TextButton(onClick = {
                    quality =
                        if (quality == "Auto") {
                            "High"
                        } else if (quality == "High") {
                            "Data saver"
                        } else {
                            "Auto"
                        }
                }) {
                    Text("Change")
                }
            },
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        ListItem(
            headlineContent = { Text("My wallet") },
            supportingContent = { Text("Balance and recent transactions") },
            modifier = Modifier.clickable(onClick = onWallet),
        )
        ListItem(
            headlineContent = { Text("Account security") },
            supportingContent = { Text("Profile and sign-in settings") },
            modifier = Modifier.clickable(onClick = onProfile),
        )
        ListItem(
            headlineContent = { Text("Help & support") },
            supportingContent = { Text("Get help with your account") },
            modifier = Modifier.clickable { uriHandler.openUri("https://bqsqwad.com/help") },
        )
        ListItem(
            headlineContent = { Text("Contact us") },
            supportingContent = { Text("Send a message to the support team") },
            modifier = Modifier.clickable { uriHandler.openUri("https://bqsqwad.com/contact") },
        )
        ListItem(
            headlineContent = { Text("About BQ SQWAD TV") },
            supportingContent = { Text("Bq Sqwad Technologies") },
            modifier = Modifier.clickable { uriHandler.openUri("https://bqsqwad.com/about") },
        )
        ListItem(
            headlineContent = { Text("Privacy notice") },
            supportingContent = { Text("Review the current publication status") },
            modifier = Modifier.clickable { uriHandler.openUri("https://bqsqwad.com/privacy") },
        )
        ListItem(
            headlineContent = { Text("Terms of service") },
            supportingContent = { Text("Review the current publication status") },
            modifier = Modifier.clickable { uriHandler.openUri("https://bqsqwad.com/terms") },
        )
    }
}

@Composable
fun AccountScreen(
    onWallet: () -> Unit,
    onProducer: () -> Unit,
    onSettings: () -> Unit,
    onSignOut: () -> Unit,
    onHistory: () -> Unit = {},
    onNotifications: () -> Unit = {},
) {
    val user = FirebaseAuth.getInstance().currentUser
    val uriHandler = LocalUriHandler.current
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(18.dp))
        Image(
            painter = painterResource(com.bqsqwad.tv.R.drawable.bq_sqwad_tv_mark),
            contentDescription = "BQ SQWAD TV logo",
            modifier = Modifier.size(64.dp),
        )
        Spacer(Modifier.height(10.dp))
        SqwadAvatar(name = user?.displayName ?: user?.email, modifier = Modifier.size(92.dp))
        Spacer(Modifier.height(12.dp))
        Text(user?.displayName ?: "Viewer", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Surface(shape = RoundedCornerShape(50), color = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)) {
            Text("Viewer", modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
        }
        Text(user?.email ?: "Signed in", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(20.dp))
        ProfileAction("My profile", "Account details", onSettings)
        ProfileAction("My wallet", "Balance and top-ups", onWallet)
        ProfileAction("My purchases", "Wallet transactions", onWallet)
        ProfileAction("Watch history", "Recent viewing sessions", onHistory)
        ProfileAction("Notifications", "Account and programme updates", onNotifications)
        ProfileAction("Producer studio", "Manage your channels", onProducer)
        ProfileAction("Help & support", "Get help with your account", { uriHandler.openUri("https://bqsqwad.com/help") })
        ProfileAction("About BQ SQWAD TV", "Bq Sqwad Technologies", { uriHandler.openUri("https://bqsqwad.com/about") })
        ProfileAction("Settings", "Playback and notifications", onSettings)
        Spacer(Modifier.height(18.dp))
        OutlinedButton(onClick = onSignOut, modifier = Modifier.fillMaxWidth()) { Text("Log out") }
    }
}

@Composable
private fun ProfileAction(
    title: String,
    detail: String,
    onClick: () -> Unit,
) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = { Text(detail) },
        trailingContent = { Text("›", color = MaterialTheme.colorScheme.primary) },
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
    )
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}

@Composable
private fun EmptyPanel(
    symbol: String,
    title: String,
    message: String,
) {
    Column(
        Modifier.fillMaxWidth().padding(top = 50.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(88.dp).background(Color(0xFF0B2057), RoundedCornerShape(28.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text(symbol, color = Color(0xFF9BEFFF), style = MaterialTheme.typography.headlineLarge)
        }
        Spacer(Modifier.height(16.dp))
        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ChannelListCard(
    channel: ChannelSummary,
    onClick: () -> Unit,
) {
    Card(
        Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
    ) {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            AsyncImage(
                model = channel.posterUrl,
                contentDescription = channel.title,
                modifier = Modifier.size(66.dp, 58.dp),
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(channel.title, fontWeight = FontWeight.Bold)
                Text(channel.category, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            }
            if (channel.isLive) Text("LIVE", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall)
        }
    }
}
