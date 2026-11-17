package com.bqsqwad.tv.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val SqwadDarkColors =
    darkColorScheme(
        primary = Signal,
        onPrimary = Ink,
        secondary = Signal,
        background = Ink,
        onBackground = TextPrimary,
        surface = Indigo,
        onSurface = TextPrimary,
        surfaceVariant = IndigoRaised,
        onSurfaceVariant = TextMuted,
        error = LiveRed,
    )

private val SqwadLightColors =
    lightColorScheme(
        primary = Color(0xFF1456B8),
        onPrimary = Color.White,
        secondary = Color(0xFF087E9B),
        onSecondary = Color.White,
        background = Color(0xFFF7F9FE),
        onBackground = Color(0xFF17243D),
        surface = Color.White,
        onSurface = Color(0xFF17243D),
        surfaceVariant = Color(0xFFE9EFF8),
        onSurfaceVariant = Color(0xFF465875),
        error = Color(0xFFB3261E),
    )

@Composable
fun BqSqwadTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) SqwadDarkColors else SqwadLightColors,
        content = content,
    )
}
