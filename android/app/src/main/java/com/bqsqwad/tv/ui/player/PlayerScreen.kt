package com.bqsqwad.tv.ui.player
import com.bqsqwad.tv.ui.ErrorMessages

import android.app.Activity
import android.content.pm.ActivityInfo
import android.view.TextureView
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionParameters
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.TrackSelectionDialogBuilder
import androidx.mediarouter.app.MediaRouteButton
import com.bqsqwad.tv.data.security.DeviceSecurity
import com.bqsqwad.tv.data.session.SessionRepository
import com.bqsqwad.tv.data.session.SessionSnapshot
import com.bqsqwad.tv.domain.billing.DisplayMeter
import com.google.android.gms.cast.framework.CastButtonFactory
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.Currency
import java.util.Locale
import kotlin.math.max

@Composable
fun PlayerScreen(
    channelId: String,
    onExit: () -> Unit,
    onTopUp: () -> Unit = {},
) {
    val context = LocalContext.current
    val activity = context as? Activity
    val scope = rememberCoroutineScope()
    val repo = remember { SessionRepository() }
    var session by remember { mutableStateOf<SessionSnapshot?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var zoom by remember { mutableFloatStateOf(1f) }
    var panX by remember { mutableFloatStateOf(0f) }
    var panY by remember { mutableFloatStateOf(0f) }
    var locked by remember { mutableStateOf(false) }
    var quality by remember { mutableStateOf("Auto") }
    var playing by remember { mutableStateOf(false) }
    var position by remember { mutableLongStateOf(0L) }
    var duration by remember { mutableLongStateOf(0L) }
    var fullscreen by remember { mutableStateOf(false) }
    var heartbeatSequence by remember { mutableLongStateOf(0L) }
    var localElapsed by remember { mutableLongStateOf(0L) }
    var showTopUp by remember { mutableStateOf(false) }
    var retryCount by remember(channelId) { mutableIntStateOf(0) }
    val player = remember { ExoPlayer.Builder(context).build().apply { playWhenReady = true } }
    LaunchedEffect(session?.playbackUrl) {
        val url = session?.playbackUrl ?: return@LaunchedEffect
        val resumeAt = player.currentPosition.coerceAtLeast(0L)
        val resumePlayback = if (player.mediaItemCount == 0) true else player.playWhenReady
        val mime = if (url.contains(".mpd", true))MimeTypes.APPLICATION_MPD else MimeTypes.APPLICATION_M3U8
        player.setMediaItem(
            MediaItem
                .Builder()
                .setUri(url)
                .setMimeType(mime)
                .build(),
            resumeAt,
        )
        player.prepare()
        player.playWhenReady = resumePlayback
    }
    LaunchedEffect(channelId, retryCount) {
        runCatching { repo.start(context, channelId) }
            .onSuccess {
                session = it
                error = null
            }.onFailure {
                error =
                    ErrorMessages.TRY_AGAIN
            }
    }
    DisposableEffect(session?.sessionId) {
        val sessionId = session?.sessionId
        onDispose { if (sessionId != null)scope.launch { runCatching { repo.end(sessionId) } } }
    }
    DisposableEffect(player) {
        val listener =
            object : Player.Listener {
                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    playing = isPlaying
                }

                override fun onPlaybackStateChanged(playbackState: Int) {
                    duration = player.duration.coerceAtLeast(0L)
                }
            }
        player.addListener(listener)
        onDispose {
            player.removeListener(listener)
            player.release()
        }
    }
    LaunchedEffect(player) {
        while (isActive) {
            position = player.currentPosition.coerceAtLeast(0L)
            duration = player.duration.coerceAtLeast(0L)
            delay(500)
        }
    }
    LaunchedEffect(session?.sessionId) {
        val active = session ?: return@LaunchedEffect
        while (isActive) {
            delay(10 * 60 * 1000L)
            runCatching { repo.refresh(active.sessionId) }
                .onSuccess { refreshed ->
                    session = session?.copy(playbackUrl = refreshed.playbackUrl)
                }.onFailure {
                    player.pause()
                    error = ErrorMessages.TRY_AGAIN
                }
        }
    }
    LaunchedEffect(session?.sessionId) {
        val active = session ?: return@LaunchedEffect
        while (isActive) {
            delay(15_000)
            heartbeatSequence++
            var updated: SessionSnapshot? = null
            var attempt = 0
            while (attempt < 3 && updated == null) {
                runCatching {
                    repo.heartbeat(
                        active.sessionId,
                        heartbeatSequence,
                        reportedPlaybackState(player),
                        player.currentPosition.coerceAtLeast(0L),
                    )
                }.onSuccess {
                    updated =
                        it
                }.onFailure {
                    attempt++
                    if (attempt < 3)delay(1000L shl attempt)
                }
            }
            if (updated == null) {
                player.pause()
                error = ErrorMessages.TRY_AGAIN
            } else {
                session = updated
                error = null
                localElapsed = 0L
                if (!updated.active || updated.walletBalanceMinor <= 0L) {
                    player.pause()
                    showTopUp = true
                }
            }
        }
    }
    LaunchedEffect(session?.sessionId) {
        while (isActive) {
            delay(1000)
            if (playing)localElapsed++
        }
    }
    DisposableEffect(activity) {
        activity?.window?.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        onDispose {
            activity?.window?.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
            activity?.requestedOrientation =
                ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            activity?.let { WindowCompat.getInsetsController(it.window, it.window.decorView).show(WindowInsetsCompat.Type.systemBars()) }
        }
    }
    DisposableEffect(session?.sessionId) {
        val owner = androidx.lifecycle.ProcessLifecycleOwner.get()
        val observer =
            androidx.lifecycle.LifecycleEventObserver { _, event ->
                if (event == androidx.lifecycle.Lifecycle.Event.ON_START) {
                    scope.launch {
                        session?.let { s ->
                            runCatching {
                                repo.heartbeat(
                                    s.sessionId,
                                    ++heartbeatSequence,
                                    reportedPlaybackState(player),
                                    player.currentPosition.coerceAtLeast(0L),
                                )
                            }.onSuccess {
                                session =
                                    it
                            }.onFailure { player.pause() }
                        }
                    }
                }
                if (event == androidx.lifecycle.Lifecycle.Event.ON_STOP) {
                    scope.launch {
                        session?.let { s ->
                            runCatching {
                                repo.heartbeat(
                                    s.sessionId,
                                    ++heartbeatSequence,
                                    reportedPlaybackState(player),
                                    player.currentPosition.coerceAtLeast(0L),
                                )
                            }.onSuccess {
                                session =
                                    it
                            }
                        }
                    }
                }
            }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer) }
    }
    BackHandler(enabled = true) {
        if (fullscreen) {
            fullscreen = false
            activity?.let { WindowCompat.getInsetsController(it.window, it.window.decorView).show(WindowInsetsCompat.Type.systemBars()) }
        } else {
            scope.launch {
                session?.let { s ->
                    runCatching { repo.end(s.sessionId) }
                }
                onExit()
            }
        }
    }
    Column(Modifier.fillMaxSize().padding(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = {
                scope.launch {
                    session?.let { s -> runCatching { repo.end(s.sessionId) } }
                    onExit()
                }
            }) { Text("← Exit player") }
            ;Text("NOW PLAYING", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall)
        }
        Box(
            Modifier
                .fillMaxWidth()
                .weight(1f)
                .pointerInput(locked) {
                    detectTransformGestures { _, pan, scale, _ ->
                        if (!locked) {
                            zoom = (zoom * scale).coerceIn(1f, 4f)
                            panX += pan.x
                            panY += pan.y
                            if (zoom == 1f) {
                                panX = 0f
                                panY = 0f
                            }
                        }
                    }
                }.pointerInput(locked) {
                    detectTapGestures(onDoubleTap = {
                        if (!locked) {
                            zoom =
                                if (zoom >
                                    1f
                                ) {
                                    1f
                                } else {
                                    2f
                                }
                            ;if (zoom == 1f) {
                                panX = 0f
                                panY = 0f
                            }
                        }
                    })
                },
            contentAlignment = androidx.compose.ui.Alignment.Center,
        ) {
            if (session == null) {
                Column(horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
                    if (error == null) CircularProgressIndicator()
                    Text(
                        error ?: "Getting this video ready…",
                        Modifier.padding(top = 12.dp),
                    )
                    if (error != null) {
                        Button(
                            onClick = {
                                error = null
                                retryCount++
                            },
                            modifier = Modifier.padding(top = 12.dp),
                        ) {
                            Text("Retry secure connection")
                        }
                    }
                }
            } else {
                AndroidView(
                    factory = { TextureView(it) },
                    modifier =
                        Modifier.fillMaxSize().graphicsLayer {
                            scaleX = zoom
                            scaleY = zoom
                            translationX = panX
                            translationY =
                                panY
                        },
                    update = { player.setVideoTextureView(it) },
                )
                Image(
                    painter = painterResource(com.bqsqwad.tv.R.drawable.bq_sqwad_tv_mark),
                    contentDescription = "BQ SQWAD TV watermark",
                    modifier = Modifier
                        .align(androidx.compose.ui.Alignment.TopEnd)
                        .padding(12.dp)
                        .size(width = 76.dp, height = 42.dp)
                        .graphicsLayer { alpha = 0.42f },
                )
            }
        }
        session?.let { s ->
            val meter = DisplayMeter.estimate(s.sessionTotalMinor, s.ratePerMinuteMinor, localElapsed)
            val warning = DisplayMeter.warning(s.timeRemainingSeconds)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text("RATE / MIN", style = MaterialTheme.typography.labelSmall)
                    Text(formatMoney(s.ratePerMinuteMinor, s.currency))
                }
                Column {
                    Text("SESSION ESTIMATE", style = MaterialTheme.typography.labelSmall)
                    Text(formatMoney(meter.estimatedTotalMinor, s.currency), color = MaterialTheme.colorScheme.primary)
                }
                Column {
                    Text("WALLET", style = MaterialTheme.typography.labelSmall)
                    Text(formatMoney(s.walletBalanceMinor, s.currency))
                }
                Column {
                    Text("TIME LEFT", style = MaterialTheme.typography.labelSmall)
                    Text(s.timeRemainingSeconds.toString() + "s")
                }
            }
            if (warning !=
                null
            ) {
                Text(
                    if (warning ==
                        60L
                    ) {
                        "One minute of balance remaining."
                    } else {
                        "Five minutes of balance remaining."
                    },
                    color = MaterialTheme.colorScheme.secondary,
                )
            }
            if (s.walletBalanceMinor <= 0L || s.timeRemainingSeconds <= 0L) {
                player.pause()
                showTopUp = true
            }
            Slider(
                value =
                    if (duration >
                        0
                    ) {
                        position.toFloat().coerceIn(0f, duration.toFloat())
                    } else {
                        0f
                    },
                onValueChange = { player.seekTo(it.toLong()) },
                valueRange =
                    0f..max(1f, duration.toFloat()),
                enabled = duration > 0,
            )
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = { if (playing)player.pause() else player.play() }) { Text(if (playing)"Pause" else "Play") }
            TextButton(onClick = { player.seekToDefaultPosition() }) { Text("Go Live") }
            TextButton(
                onClick = { TrackSelectionDialogBuilder(context, "Audio", player, C.TRACK_TYPE_AUDIO).build().show() },
            ) { Text("Audio") }
            TextButton(
                onClick = { TrackSelectionDialogBuilder(context, "Subtitles", player, C.TRACK_TYPE_TEXT).build().show() },
            ) { Text("CC") }
            TextButton(onClick = { locked = !locked }) { Text(if (locked)"Unlock zoom" else "Lock zoom") }
            TextButton(onClick = {
                fullscreen = !fullscreen
                activity?.let {
                    val ctl = WindowCompat.getInsetsController(it.window, it.window.decorView)
                    if (fullscreen)ctl.hide(WindowInsetsCompat.Type.systemBars())else ctl.show(WindowInsetsCompat.Type.systemBars())
                }
            }) { Text(if (fullscreen)"Exit full" else "Full screen") }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Zoom " + String.format(Locale.US, "%.1fx", zoom))
            Slider(zoom, { zoom = it.coerceIn(1f, 4f) }, valueRange = 1f..4f, modifier = Modifier.weight(1f).padding(horizontal = 10.dp))
            TextButton(onClick = {
                if (activity !=
                    null
                ) {
                    activity.requestedOrientation =
                        if (activity.requestedOrientation ==
                            ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                        ) {
                            ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                        } else {
                            ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                        }
                }
            }) { Text("Rotate") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("Auto", "1080p", "720p", "480p").forEach { v ->
                FilterChip(selected = quality == v, onClick = {
                    quality =
                        v
                    ;val b = TrackSelectionParameters.Builder(context)
                    when (v) {
                        "1080p" -> b.setMaxVideoSize(1920, 1080)
                        "720p" -> b.setMaxVideoSize(1280, 720)
                        "480p" -> b.setMaxVideoSize(854, 480)
                        else -> b.setMaxVideoSize(Int.MAX_VALUE, Int.MAX_VALUE)
                    }
                    player.trackSelectionParameters =
                        b.build()
                }, label = { Text(v) })
            }
        }
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
        ) {
            TextButton(onClick = {
                if (android.os.Build.VERSION.SDK_INT >= 26 &&
                    activity != null
                ) {
                    activity.enterPictureInPictureMode(
                        android.app.PictureInPictureParams
                            .Builder()
                            .build(),
                    )
                }
            }) { Text("Picture in picture") }
            AndroidView(factory = { ctx ->
                MediaRouteButton(ctx).also { CastButtonFactory.setUpMediaRouteButton(ctx, it) }
            }, modifier = Modifier.size(48.dp))
        }
        DeviceSecurity.inspect().warning?.let {
            Text(
                it,
                color = MaterialTheme.colorScheme.secondary,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
    if (showTopUp) {
        AlertDialog(onDismissRequest = {
        }, title = {
            Text(
                "Wallet balance exhausted",
            )
        }, text = { Text("Playback is paused. Add credits to continue watching.") }, confirmButton = {
            TextButton(onClick = {
                scope.launch {
                    session?.let { s ->
                        runCatching { repo.end(s.sessionId) }
                    }
                    onTopUp()
                }
            }) { Text("Top up wallet") }
        })
    }
}

private fun formatMoney(
    minor: Long,
    currency: String,
): String {
    val fractionDigits =
        runCatching { Currency.getInstance(currency).defaultFractionDigits }
            .getOrDefault(2)
            .coerceAtLeast(0)
    val rawAmount = BigDecimal.valueOf(minor)
    val shiftedAmount = rawAmount.movePointLeft(fractionDigits)
    val formattedAmount = shiftedAmount.setScale(fractionDigits, RoundingMode.DOWN)
    return currency + " " + formattedAmount.toPlainString()
}

private fun reportedPlaybackState(player: ExoPlayer): String =
    when {
        player.isPlaying -> "playing"
        player.playbackState == Player.STATE_BUFFERING -> "buffering"
        player.playbackState == Player.STATE_ENDED -> "ended"
        player.playbackState == Player.STATE_IDLE -> "idle"
        else -> "paused"
    }
