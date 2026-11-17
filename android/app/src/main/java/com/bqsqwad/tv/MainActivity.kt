package com.bqsqwad.tv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.bqsqwad.tv.data.preferences.ThemePreferences
import com.bqsqwad.tv.ui.BqSqwadTvApp
import com.bqsqwad.tv.ui.theme.BqSqwadTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Read the local preference synchronously before the first Compose frame,
        // avoiding a flash of the wrong palette during app startup.
        val firstPaintTheme = ThemePreferences.read(this)

        setContent {
            var themeMode by remember { mutableStateOf(firstPaintTheme) }
            BqSqwadTheme(themeMode = themeMode) {
                BqSqwadTvApp(
                    themeMode = themeMode,
                    onThemeModeChange = { next ->
                        themeMode = next
                        ThemePreferences.save(this@MainActivity, next)
                    },
                )
            }
        }
    }
}
