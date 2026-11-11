package com.bqsqwad.tv

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class BqSqwadTvApplication : Application() {
 override fun onCreate() {
  super.onCreate()
  if (FirebaseApp.getApps(this).isEmpty()) {
   val options = FirebaseOptions.Builder()
    .setProjectId("bq-sqwad-tv")
    .setApplicationId("1:1053755940737:android:ac3108c076ead9bac25280")
    .setApiKey("AIzaSyD6QfAIfn_T0YWxxYKDbw8lZfj_s81N2ow") //gitleaks:allow Firebase client API key; not a server credential
    .setGcmSenderId("1053755940737")
    .build()
   FirebaseApp.initializeApp(this, options)
  }
 }
}
