package com.bqsqwad.tv.ui.screens
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.bqsqwad.tv.data.catalog.*
import kotlinx.coroutines.launch
@Composable fun HomeScreen(onSearch:()->Unit={},onChannel:(String)->Unit={}) {
 val repo=remember{CatalogRepository()}; val scope=rememberCoroutineScope()
 var catalog by remember{mutableStateOf<CatalogHomeResponse?>(null)}
 var loading by remember{mutableStateOf(true)}; var error by remember{mutableStateOf<String?>(null)}
 fun refresh(){scope.launch{loading=true;error=null;runCatching{repo.home()}.onSuccess{catalog=it}.onFailure{error=it.localizedMessage?: "Could not load catalogue."};loading=false}}
 LaunchedEffect(Unit){refresh()}
 Column(Modifier.fillMaxSize().padding(top=18.dp)) {
  Row(Modifier.fillMaxWidth().padding(horizontal=20.dp),horizontalArrangement=Arrangement.SpaceBetween) {
   Column { Text("BQ SQWAD TV",style=MaterialTheme.typography.headlineMedium);Text("LIVE ENTERTAINMENT",color=MaterialTheme.colorScheme.primary,style=MaterialTheme.typography.labelMedium) }
   TextButton(onClick=onSearch){Text("Search")}
  }
  Spacer(Modifier.height(18.dp))
  Card(Modifier.fillMaxWidth().padding(horizontal=16.dp)){Column(Modifier.padding(22.dp)){
   Text("THE LIVE SIGNAL",color=MaterialTheme.colorScheme.secondary,style=MaterialTheme.typography.labelLarge)
   Text("Every moment. One signal.",style=MaterialTheme.typography.headlineSmall)
   Text("Live sport, stories and entertainment in one place.",color=MaterialTheme.colorScheme.onSurfaceVariant)
  }}
  Spacer(Modifier.height(18.dp))
  Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal=16.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)){
   listOf("All","Football","Movies","News","Shows","Replays").forEach{AssistChip(onClick=onSearch,label={Text(it)})}
  }
  when {
   loading->LinearProgressIndicator(Modifier.fillMaxWidth().padding(top=24.dp))
   error!=null->Column(Modifier.padding(20.dp)){Text("Catalog unavailable",style=MaterialTheme.typography.titleLarge);Text(error.orEmpty(),color=MaterialTheme.colorScheme.onSurfaceVariant);TextButton(onClick={refresh()}){Text("Retry")}}
   catalog!=null->{
    CatalogRail("Live now",catalog!!.liveNow,onChannel)
    CatalogRail("Starting soon",catalog!!.startingSoon,onChannel)
    CatalogRail("Channels",catalog!!.channels,onChannel)
    CatalogRail("Replays",catalog!!.replays,onChannel)
    CatalogRail("Continue watching",catalog!!.continueWatching,onChannel)
    CatalogRail("Trending",catalog!!.trending,onChannel)
   }
  }
 }
}
@Composable private fun CatalogRail(title:String,items:List<ChannelSummary>,onChannel:(String)->Unit){
 if(items.isEmpty())return
 Column(Modifier.padding(top=18.dp)){
  Text(title,Modifier.padding(horizontal=20.dp),style=MaterialTheme.typography.titleLarge)
  LazyRow(contentPadding=PaddingValues(horizontal=16.dp),horizontalArrangement=Arrangement.spacedBy(12.dp)){
   items(items,key={it.id}){item->Column(Modifier.width(148.dp).clickable{onChannel(item.id)}){
    AsyncImage(model=item.posterUrl,contentDescription=item.title,modifier=Modifier.fillMaxWidth().height(100.dp),contentScale=ContentScale.Crop)
    Text(item.title,style=MaterialTheme.typography.titleSmall,maxLines=1)
    Text(item.currentProgramme?:item.category,style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant,maxLines=1)
    if(item.isLive)Text("● LIVE",color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.labelSmall)
   }}
  }
 }
}
