package com.bqsqwad.tv.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
private val SqwadColors = darkColorScheme(primary=Signal,onPrimary=Ink,secondary=Gold,background=Ink,onBackground=TextPrimary,surface=Indigo,onSurface=TextPrimary,surfaceVariant=IndigoRaised,onSurfaceVariant=TextMuted,error=LiveRed)
@Composable fun BqSqwadTheme(content: @Composable () -> Unit) { MaterialTheme(colorScheme=SqwadColors,content=content) }
