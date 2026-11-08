package com.bqsqwad.tv.ui.screens
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.bqsqwad.tv.data.catalog.*
import kotlinx.coroutines.launch
@Composable fun ChannelScreen(channelId:String,onBack:()->Unit,onPlay:(String)->Unit){
 val context=LocalContext.current
 val repo=remember(context){CatalogRepository(context)};var detail by remember{mutableStateOf<ChannelDetailResponse?>(null)};var error by remember{mutableStateOf<String?>(null)}
 LaunchedEffect(channelId){runCatching{repo.channel(channelId)}.onSuccess{detail=it}.onFailure{error=it.localizedMessage?: "Channel unavailable."}}
 Column(Modifier.fillMaxSize().padding(18.dp)){
  TextButton(onClick=onBack){Text("← Back")}
  if(detail==null){Text(error?: "Loading channel…",color=MaterialTheme.colorScheme.onSurfaceVariant)}
  else{
   AsyncImage(detail!!.channel.posterUrl,detail!!.channel.title,Modifier.fillMaxWidth().height(190.dp),contentScale=ContentScale.Crop)
   Text(detail!!.channel.title,style=MaterialTheme.typography.headlineMedium)
   Text(detail!!.channel.category,color=MaterialTheme.colorScheme.onSurfaceVariant)
   Button(onClick={onPlay(channelId)},Modifier.fillMaxWidth()){Text("Watch")}
   Spacer(Modifier.height(18.dp));Text("Schedule",style=MaterialTheme.typography.titleLarge)
   LazyColumn{items(detail!!.schedule,key={it.id}){program->ListItem(headlineContent={Text(program.title)},supportingContent={Text(program.startsAt+" – "+program.endsAt)})}}
  }
 }
}
