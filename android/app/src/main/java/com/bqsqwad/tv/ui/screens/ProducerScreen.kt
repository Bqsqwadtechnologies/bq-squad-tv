package com.bqsqwad.tv.ui.screens
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.bqsqwad.tv.BuildConfig
import com.bqsqwad.tv.data.producer.*
import kotlinx.coroutines.launch
@Composable fun ProducerScreen(onBack:()->Unit){
 val context=LocalContext.current;val scope=rememberCoroutineScope();val repo=remember{ProducerRepository()}
 var data by remember{mutableStateOf<ProducerSummary?>(null)};var error by remember{mutableStateOf<String?>(null)}
 LaunchedEffect(Unit){runCatching{repo.summary()}.onSuccess{data=it}.onFailure{error=it.localizedMessage?: "Producer summary unavailable."}}
 Column(Modifier.fillMaxSize().padding(20.dp)){
  TextButton(onClick=onBack){Text("← Back")}
  Text("Producer studio",style=MaterialTheme.typography.headlineMedium)
  if(data==null)Text(error?: "Loading your producer access…",color=MaterialTheme.colorScheme.onSurfaceVariant)
  else if(!data!!.approved)Text("Your producer account is not approved yet.",color=MaterialTheme.colorScheme.secondary)
  else{
   Text("APPROVED PRODUCER",color=MaterialTheme.colorScheme.primary)
   Text(data!!.channelCount.toString()+" channels • "+data!!.liveViewers+" live viewers")
   Text("Watch time: "+data!!.watchSeconds+" seconds")
   Text("Earnings: "+data!!.currency+" "+String.format("%.2f",data!!.earningsMinor/100.0),style=MaterialTheme.typography.headlineSmall)
   if(data!!.roleTags.any{it.equals("Owner",true)||it.equals("Admin",true)})Text("Owner / Admin access",color=MaterialTheme.colorScheme.secondary)
  }
  Spacer(Modifier.height(20.dp))
  Button(onClick={
   runCatching{require(!BuildConfig.PRODUCER_CONSOLE_URL.contains("YOUR-WEBSITE"));context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(BuildConfig.PRODUCER_CONSOLE_URL)))}
    .onFailure{error="Set PRODUCER_CONSOLE_URL in local.properties to open the website console."}
  },modifier=Modifier.fillMaxWidth()){Text("Open full Producer Console")}
 }
}
