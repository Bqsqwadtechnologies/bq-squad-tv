package com.bqsqwad.tv.data.notifications
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.bqsqwad.tv.MainActivity
import com.bqsqwad.tv.R
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
class BqMessagingService:FirebaseMessagingService(){
 override fun onNewToken(token:String){
  super.onNewToken(token)
  Executors.newSingleThreadExecutor().execute{
   runCatching{
    val connection=URL(com.bqsqwad.tv.BuildConfig.API_BASE_URL.trimEnd('/')+"/v1/devices/push-token").openConnection() as HttpURLConnection
    connection.requestMethod="POST";connection.doOutput=true;connection.setRequestProperty("Content-Type","application/json")
    val idToken=com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.getIdToken(false)?.result?.token
    if(idToken!=null)connection.setRequestProperty("Authorization","Bearer "+idToken)
    connection.outputStream.use{it.write(("{\"token\":\""+token+"\",\"platform\":\"android\"}").toByteArray())}
    connection.responseCode;connection.disconnect()
   }
  }
 }
 override fun onMessageReceived(message:RemoteMessage){
  super.onMessageReceived(message)
  val title=message.data["title"]?:message.notification?.title?:"BQ SQWAD TV"
  val body=message.data["body"]?:message.notification?.body?:"You have a new update."
  val manager=getSystemService(NotificationManager::class.java)
  if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(NotificationChannel("sqwad_updates","SQWAD updates",NotificationManager.IMPORTANCE_DEFAULT))
  val intent=Intent(this,MainActivity::class.java).apply{flags=Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP}
  val pending=PendingIntent.getActivity(this,0,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val notification=NotificationCompat.Builder(this,"sqwad_updates").setSmallIcon(R.drawable.ic_stat_bq_sqwad_tv).setContentTitle(title).setContentText(body).setContentIntent(pending).setAutoCancel(true).build()
  NotificationManagerCompat.from(this).notify((System.currentTimeMillis()%Int.MAX_VALUE).toInt(),notification)
 }
}
