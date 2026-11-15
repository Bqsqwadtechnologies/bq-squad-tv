package com.bqsqwad.tv.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
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

@Composable
fun HomeScreen(
    onSearch: () -> Unit = {},
    onChannel: (String) -> Unit = {},
    onWallet: () -> Unit = {},
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

    fun refresh() {
        scope.launch {
            loading = true
            error = null
            runCatching { repo.home() }
                .onSuccess { catalog = it }
                .onFailure { error = it.localizedMessage ?: "Could not load catalogue." }
            loading = false
        }
    }

    LaunchedEffect(Unit) { refresh() }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(top = 12.dp, bottom = 20.dp),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(
                    painter = painterResource(com.bqsqwad.tv.R.drawable.bq_sqwad_tv_mark),
                    contentDescription = "BQ SQWAD TV logo",
                    modifier = Modifier.size(42.dp),
                )
                Spacer(Modifier.width(9.dp))
                Column {
                    Text("BQ SQWAD TV", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black)
                    Text(
                        "WATCH  •  STREAM  •  ENJOY",
                        color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onSearch) { Text("⌕", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onSurface) }
                IconButton(onClick = onWallet) { Text("◉", color = MaterialTheme.colorScheme.primary) }
            }
        }

        Spacer(Modifier.height(18.dp))

        Card(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF071B58)),
        ) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(218.dp)
                    .background(
                        Brush.linearGradient(
                            listOf(Color(0xFF087BDF), Color(0xFF092B83), Color(0xFF030B2A)),
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
                        .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xF5030B2A))))
                        .padding(20.dp),
                ) {
                    Text("PREMIUM ENTERTAINMENT", color = Color(0xFF9BEFFF), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                    Text(
                        "Your world of entertainment.",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Black,
                        color = Color.White,
                    )
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = onLive,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00C8F0), contentColor = Color(0xFF031039)),
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
            QuickAccessCard("Live TV", "▣", onLive)
            QuickAccessCard("Movies", "◉", onLibrary)
            QuickAccessCard("Series", "▤", onLibrary)
            QuickAccessCard("Kids", "☺", onLibrary)
        }

        when {
            loading -> LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 24.dp))
            error != null -> Column(Modifier.padding(20.dp)) {
                Text("Catalogue unavailable", style = MaterialTheme.typography.titleLarge)
                Text(error.orEmpty(), color = MaterialTheme.colorScheme.onSurfaceVariant)
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
                    catalog!!.liveNow.isEmpty() && catalog!!.startingSoon.isEmpty() &&
                    catalog!!.channels.isEmpty() && catalog!!.replays.isEmpty() &&
                    catalog!!.continueWatching.isEmpty() && catalog!!.trending.isEmpty()
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

@Composable
private fun QuickAccessCard(title: String, symbol: String, onClick: () -> Unit) {
    Card(
        Modifier.width(88.dp).height(100.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF0A246B)),
    ) {
        Column(
            Modifier.fillMaxSize().padding(10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(symbol, color = Color(0xFF9BEFFF), style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(5.dp))
            Text(title, color = Color.White, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun CatalogRail(title: String, items: List<ChannelSummary>, onChannel: (String) -> Unit) {
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
                                Brush.linearGradient(listOf(Color(0xFF1459B8), Color(0xFF07143D))),
                            ),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("BQ", color = Color(0xFF9BEFFF), style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Black)
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
