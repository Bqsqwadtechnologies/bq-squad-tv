# ProGuard and R8 Rules for BQ SQWAD TV Android Application

# Retain annotations and signatures for reflection / serialization
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes EnclosingMethod
-keepattributes InnerClasses

# Kotlin & Coroutines
-keepclassmembers class kotlinx.coroutines.** { *; }

# Google Play Services & Play Billing
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**
-keep class com.android.billingclient.** { *; }
-dontwarn com.android.billingclient.**
-keep class com.google.android.play.core.** { *; }

# Firebase (Auth, Firestore, Messaging, Crashlytics, Analytics, App Check)
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# Media3 & ExoPlayer
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**

# Networking (OkHttp & Retrofit)
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn retrofit2.**
-keep class retrofit2.** { *; }
-keepclasseswithmembers class * {
    @retrofit2.http.* <methods>;
}

# Serialization (Moshi)
-keepclassmembers class * {
    @com.squareup.moshi.* <fields>;
    @com.squareup.moshi.* <methods>;
}
-keep class com.squareup.moshi.** { *; }

# Dependency Injection (Hilt / Dagger)
-keep class * extends dagger.hilt.internal.GeneratedComponent { *; }
-keep class * extends dagger.hilt.internal.ComponentManager { *; }
-keepclassmembers class * {
    @javax.inject.* <init>(...);
    @javax.inject.* <fields>;
    @javax.inject.* <methods>;
}

# Image Loading (Coil)
-keep class coil.** { *; }
-dontwarn coil.**

# Data Models & Domain Objects
-keep class com.bqsqwad.tv.data.** { *; }
-keep class com.bqsqwad.tv.domain.** { *; }
