package com.bqsqwad.tv.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material.icons.filled.ChildCare
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.bqsqwad.tv.data.catalog.CatalogHomeResponse
import com.bqsqwad.tv.data.catalog.CatalogRepository
import com.bqsqwad.tv.data.catalog.ChannelSummary
import kotlinx.coroutines.launch
import com.google.firebase.auth.FirebaseAuth

@Composable
fun HomeScreen(
    onSearch: () -> Unit = {},
    onChannel: (String) -> Unit = {},
    onWallet: () -> Unit = {},
    onProfile: () -> Unit = {},
    onProducer: () -> Unit = {},
    onLive: () -> Unit = {},
    onLibrary: () -> Unit = {},
) {
    val context = LocalContext.current
    val repo = remember(context) { CatalogRepository(context) }
    val scope = rememberCoroutineScope()
    var catalog by remember { mutableStateOf<CatalogHomeResponse?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var showNotifications by remember { mutableStateOf(false) }
    val profileInitial = remember { (FirebaseAuth.getInstance().currentUser?.displayName?.trim()?.firstOrNull()
        ?: FirebaseAuth.getInstance().currentUser?.email?.trim()?.firstOrNull())?.uppercaseChar() ?: 'P' }

    fun refresh() {
        scope.launch {
            loading = true
            error = null
            runCatching { repo.home() }
                .onSuccess { catalog = it }
                .onFailure { error = com.bqsqwad.tv.ui.ErrorMessages.TRY_AGAIN }
            loading = false
        }
    }

    LaunchedEffect(Unit) { refresh() }

    if (showNotifications) {
        AlertDialog(
            onDismissRequest = { showNotifications = false },
            title = { Text("Notifications") },
            text = { Text("Programme, account and wallet updates will appear here.") },
            confirmButton = { TextButton(onClick = { showNotifications = false }) { Text("Close") } },
        )
    }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top)),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .padding(horizontal = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(
                    painter = painterResource(com.bqsqwad.tv.R.drawable.bq_sqwad_tv_mark),
                    contentDescription = "BQ SQWAD TV logo",
                    modifier = Modifier.size(54.dp),
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onSearch, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Default.Search, contentDescription = "Search", tint = MaterialTheme.colorScheme.onSurface)
                }
                IconButton(onClick = { showNotifications = true }, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Default.NotificationsNone, contentDescription = "Notifications", tint = MaterialTheme.colorScheme.primary)
                }
                IconButton(
                    onClick = onProfile,
                    modifier = Modifier
                        .size(48.dp)
                        .border(2.dp, MaterialTheme.colorScheme.primary, CircleShape)
                        .clip(CircleShape),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = profileInitial.toString(),
                            color = MaterialTheme.colorScheme.primary,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }

        Column(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(top = 4.dp, bottom = 20.dp),
        ) {
            Spacer(Modifier.height(18.dp))

        Card(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(218.dp)
                    .background(
                        Brush.linearGradient(
                            listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.surface),
                        ),
                    ),
            ) {
                val heroPoster = catalog?.trending?.firstOrNull()?.posterUrl
                if (!heroPoster.isNullOrBlank()) {
                    AsyncImage(
                        model = heroPoster,
                        contentDescription = null,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop,
                        alpha = 0.38f,
                    )
                }
                Column(
                    Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .background(Brush.verticalGradient(listOf(Color.Transparent, MaterialTheme.colorScheme.surface.copy(alpha = 0.96f))))
                        .padding(20.dp),
                ) {
                    Text(
                        "PREMIUM ENTERTAINMENT",
                        color = MaterialTheme.colorScheme.secondary,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        "Your world of entertainment.",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Black,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = onLive,
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary),
                    ) {
                        Text("▶  Watch live", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        Spacer(Modifier.height(22.dp))
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 18.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Quick access", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            TextButton(onClick = onLibrary) { Text("See all  ›") }
        }
        Row(
            Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            QuickAccessCard("Live TV", Icons.Default.LiveTv, onLive)
            QuickAccessCard("Movies", Icons.Default.Movie, onLibrary)
            QuickAccessCard("Series", Icons.Default.VideoLibrary, onLibrary)
            QuickAccessCard("Kids", Icons.Default.ChildCare, onLibrary)
        }

        when {
            loading -> LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 24.dp))
            error != null ->
                Column(Modifier.padding(20.dp)) {
                    Text("Catalogue unavailable", style = MaterialTheme.typography.titleLarge)
                    Text(com.bqsqwad.tv.ui.ErrorMessages.TRY_AGAIN, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    TextButton(onClick = { refresh() }) { Text("Retry") }
                }
            catalog != null -> {
                CatalogRail("Live now", catalog!!.liveNow, onChannel)
                CatalogRail("Trending now", catalog!!.trending, onChannel)
                CatalogRail("Starting soon", catalog!!.startingSoon, onChannel)
                CatalogRail("Channels", catalog!!.channels, onChannel)
                CatalogRail("Continue watching", catalog!!.continueWatching, onChannel)
                CatalogRail("Replays", catalog!!.replays, onChannel)
                if (
                    catalog!!.liveNow.isEmpty() &&
                    catalog!!.startingSoon.isEmpty() &&
                    catalog!!.channels.isEmpty() &&
                    catalog!!.replays.isEmpty() &&
                    catalog!!.continueWatching.isEmpty() &&
                    catalog!!.trending.isEmpty()
                ) {
                    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 24.dp)) {
                        Column(Modifier.padding(20.dp)) {
                            Text("Your channels are getting ready", style = MaterialTheme.typography.titleLarge)
                            Spacer(Modifier.height(6.dp))
                            Text(
                                "Approved channels and licensed content will appear here when they are published.",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                }
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 22.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            OutlinedButton(onClick = onWallet, modifier = Modifier.weight(1f)) { Text("My wallet") }
            OutlinedButton(onClick = onProducer, modifier = Modifier.weight(1f)) { Text("Producer studio") }
        }
        }
    }
}

@Composable
private fun QuickAccessCard(
    title: String,
    icon: ImageVector,
    onClick: () -> Unit,
) {
    Card(
        Modifier.width(88.dp).height(100.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(
            Modifier.fillMaxSize().padding(10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(30.dp))
            Spacer(Modifier.height(5.dp))
            Text(title, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun CatalogRail(
    title: String,
    items: List<ChannelSummary>,
    onChannel: (String) -> Unit,
) {
    if (items.isEmpty()) return
    Column(Modifier.padding(top = 22.dp)) {
        Text(
            title,
            Modifier.padding(horizontal = 18.dp),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(10.dp))
        LazyRow(
            contentPadding = PaddingValues(horizontal = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(items, key = { it.id }) { item ->
                Column(Modifier.width(148.dp).clickable { onChannel(item.id) }) {
                    if (!item.posterUrl.isNullOrBlank()) {
                        AsyncImage(
                            model = item.posterUrl,
                            contentDescription = item.title,
                            modifier = Modifier.fillMaxWidth().height(112.dp),
                            contentScale = ContentScale.Crop,
                        )
                    } else {
                        Box(
                            Modifier.fillMaxWidth().height(112.dp).background(
                                Brush.linearGradient(listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.surfaceVariant)),
                            ),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                "BQ",
                                color = Color(0xFF9BEFFF),
                                style = MaterialTheme.typography.headlineLarge,
                                fontWeight = FontWeight.Black,
                            )
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(item.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, fontWeight = FontWeight.Bold)
                    Text(
                        item.currentProgramme ?: item.category,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                    if (item.isLive) Text("● LIVE", color = Color(0xFFFF5368), style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}
