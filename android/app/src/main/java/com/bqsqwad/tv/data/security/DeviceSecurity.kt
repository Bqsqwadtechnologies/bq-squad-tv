package com.bqsqwad.tv.data.security
import android.os.Build
import java.io.File
data class DeviceSecurityStatus(val rooted:Boolean,val emulator:Boolean,val warning:String?)
object DeviceSecurity {
 fun inspect():DeviceSecurityStatus {
  val rooted=Build.TAGS?.contains("test-keys")==true || listOf("/system/app/Superuser.apk","/system/xbin/su","/sbin/su","/system/bin/su").any{File(it).exists()}
  val emulator=Build.FINGERPRINT.startsWith("generic") || Build.MODEL.contains("Emulator",true) || Build.HARDWARE.contains("goldfish",true) || Build.HARDWARE.contains("ranchu",true)
  val warning=when{rooted->"This device may be rooted. Secure playback checks may reject the session.";emulator->"Emulator detected. Some protected streams may not be available.";else->null}
  return DeviceSecurityStatus(rooted,emulator,warning)
 }
}
