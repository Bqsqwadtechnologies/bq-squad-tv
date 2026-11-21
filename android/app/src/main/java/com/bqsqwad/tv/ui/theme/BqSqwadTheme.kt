package com.bqsqwad.tv.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable

/** Applies the app's persisted system/light/dark preference to the generated palette. */
@Composable
fun BqSqwadTheme(
    themeMode: String = "system",
    content: @Composable () -> Unit,
) {
    val darkTheme = when (themeMode) {
        "light" -> false
        "dark" -> true
        else -> isSystemInDarkTheme()
    }
    BqSqwadTvTheme(darkTheme = darkTheme, content = content)
}
