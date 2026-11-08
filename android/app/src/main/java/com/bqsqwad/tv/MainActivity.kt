package com.bqsqwad.tv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.bqsqwad.tv.ui.BqSqwadTvApp
import com.bqsqwad.tv.ui.theme.BqSqwadTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
 override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  enableEdgeToEdge()
  setContent { BqSqwadTheme { BqSqwadTvApp() } }
 }
}
