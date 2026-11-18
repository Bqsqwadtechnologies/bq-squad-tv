package com.bqsqwad.tv.data.preferences

import android.content.Context

object ThemePreferences {
    private const val FILE_NAME = "appearance_preferences"
    private const val KEY_THEME_MODE = "theme_mode"

    fun read(context: Context): String {
        return context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
            .getString(KEY_THEME_MODE, "system")
            ?.takeIf { it == "system" || it == "light" || it == "dark" }
            ?: "dark"
    }

    fun save(context: Context, themeMode: String) {
        require(themeMode == "system" || themeMode == "light" || themeMode == "dark")
        context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_THEME_MODE, themeMode)
            .apply()
    }
}
