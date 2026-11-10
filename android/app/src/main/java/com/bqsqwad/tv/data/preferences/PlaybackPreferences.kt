package com.bqsqwad.tv.data.preferences
import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.map
private val Context.playbackDataStore by preferencesDataStore(name="playback_preferences")
class PlaybackPreferences(private val context:Context){
 private val wifiOnlyKey=booleanPreferencesKey("wifi_only")
 private val dataSaverKey=booleanPreferencesKey("data_saver")
 val wifiOnly=context.playbackDataStore.data.map{it[wifiOnlyKey]?:false}
 val dataSaver=context.playbackDataStore.data.map{it[dataSaverKey]?:false}
 suspend fun setWifiOnly(enabled:Boolean){context.playbackDataStore.edit{it[wifiOnlyKey]=enabled}}
 suspend fun setDataSaver(enabled:Boolean){context.playbackDataStore.edit{it[dataSaverKey]=enabled}}
}
