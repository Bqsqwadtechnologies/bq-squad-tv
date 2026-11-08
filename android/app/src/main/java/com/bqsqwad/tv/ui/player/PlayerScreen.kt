package com.bqsqwad.tv.ui.player

import android.app.Activity
import android.content.pm.ActivityInfo
import android.view.TextureView
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionParameters
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.delay
import kotlin.math.max
import kotlin.math.min

@Composable
fun PlayerScreen(
    channelId: String,
    streamUrl: String?,
    onExit: () -> Unit
) {
    val context = LocalContext.current
    val activity = context as? Activity
    var zoom by remember { mutableFloatStateOf(1f) }
    var panX by remember { mutableFloatStateOf(0f) }
    var panY by remember { mutableFloatStateOf(0f) }
    var locked by remember { mutableStateOf(false) }
    var quality by remember { mutableStateOf("Auto") }
    var playing by remember { mutableStateOf(false) }
    var position by remember { mutableLongStateOf(0L) }
    var duration by remember { mutableLongStateOf(0L) }
    var fullscreen by remember { mutableStateOf(false) }

    val player = remember(streamUrl) {
        ExoPlayer.Builder(context).build().apply {
            playWhenReady = true
            if (!streamUrl.isNullOrBlank()) {
                val mime = when {
                    streamUrl.contains(".mpd", true) -> MimeTypes.APPLICATION_MPD
                    else -> MimeTypes.APPLICATION_M3U8
                }
                setMediaItem(MediaItem.Builder().setUri(streamUrl).setMimeType(mime).build())
                prepare()
            }
        }
    }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) { playing = isPlaying }
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
        while (true) {
            position = player.currentPosition.coerceAtLeast(0L)
            duration = player.duration.coerceAtLeast(0L)
            delay(500)
        }
    }

    DisposableEffect(activity) {
        activity?.window?.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        onDispose {
            activity?.window?.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            activity?.let { WindowCompat.getInsetsController(it.window, it.window.decorView).show(WindowInsetsCompat.Type.systemBars()) }
        }
    }

    BackHandler(enabled = fullscreen) {
        fullscreen = false
        activity?.let { WindowCompat.getInsetsController(it.window, it.window.decorView).show(WindowInsetsCompat.Type.systemBars()) }
    }

    Column(Modifier.fillMaxSize().padding(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = onExit) { Text("← Exit player") }
            Text("SECURE PLAYBACK", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall)
        }
        Box(
            Modifier.fillMaxWidth().weight(1f)
                .pointerInput(Unit) {
                    detectTransformGestures { _, pan, zoomChange, _ ->
                        if (!locked) {
                            zoom = (zoom * zoomChange).coerceIn(1f, 4f)
                            panX += pan.x
                            panY += pan.y
                            if (zoom == 1f) { panX = 0f; panY = 0f }
                        }
                    }
                }
                .pointerInput(Unit) {
                    detectTapGestures(onDoubleTap = {
                        if (!locked) {
                            zoom = if (zoom > 1f) 1f else 2f
                            if (zoom == 1f) { panX = 0f; panY = 0f }
                        }
                    })
                },
            contentAlignment = androidx.compose.ui.Alignment.Center
        ) {
            if (streamUrl.isNullOrBlank()) {
                Column(horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
                    CircularProgressIndicator()
                    Text("Waiting for a verified stream session", modifier = Modifier.padding(top = 12.dp))
                }
            } else {
                AndroidView(
                    factory = { TextureView(it) },
                    modifier = Modifier.fillMaxSize().graphicsLayer {
                        scaleX = zoom; scaleY = zoom; translationX = panX; translationY = panY
                    },
                    update = { player.setVideoTextureView(it) }
                )
            }
        }
        Text("Channel $channelId", style = MaterialTheme.typography.titleMedium)
        Slider(
            value = if (duration > 0) position.toFloat().coerceIn(0f, duration.toFloat()) else 0f,
            onValueChange = { player.seekTo(it.toLong()) },
            valueRange = 0f..max(1f, duration.toFloat()),
            enabled = duration > 0
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = { if (playing) player.pause() else player.play() }) { Text(if (playing) "Pause" else "Play") }
            TextButton(onClick = { player.seekToDefaultPosition() }) { Text("Go Live") }
            TextButton(onClick = { locked = !locked }) { Text(if (locked) "Unlock zoom" else "Lock zoom") }
            TextButton(onClick = {
                fullscreen = !fullscreen
                activity?.let {
                    val controller = WindowCompat.getInsetsController(it.window, it.window.decorView)
                    if (fullscreen) controller.hide(WindowInsetsCompat.Type.systemBars()) else controller.show(WindowInsetsCompat.Type.systemBars())
                }
            }) { Text(if (fullscreen) "Exit full" else "Full screen") }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Zoom "+String.format("%.1fx", zoom))
            Slider(value=zoom,onValueChange={zoom=it.coerceIn(1f,4f)},valueRange=1f..4f,modifier=Modifier.weight(1f).padding(horizontal=12.dp))
            TextButton(onClick={
                val mode=if(activity?.requestedOrientation==ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE) ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED else ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                activity?.requestedOrientation=mode
            }){Text("Rotate")}
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Auto","1080p","720p","480p").forEach { option ->
                FilterChip(selected=quality==option,onClick={
                    quality=option
                    val builder=TrackSelectionParameters.Builder(context)
                    when(option){
                        "1080p"->builder.setMaxVideoSize(1920,1080)
                        "720p"->builder.setMaxVideoSize(1280,720)
                        "480p"->builder.setMaxVideoSize(854,480)
                        else->builder.setMaxVideoSize(Int.MAX_VALUE,Int.MAX_VALUE)
                    }
                    player.trackSelectionParameters=builder.build()
                },label={Text(option)})
            }
        }
        TextButton(onClick = {
            if (android.os.Build.VERSION.SDK_INT >= 26 && activity != null) {
                activity.enterPictureInPictureMode(android.app.PictureInPictureParams.Builder().build())
            }
        }) { Text("Picture in picture") }
    }
}
