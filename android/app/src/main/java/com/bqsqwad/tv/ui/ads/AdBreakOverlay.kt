package com.bqsqwad.tv.ui.ads
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.bqsqwad.tv.data.ads.AdBreak
import com.bqsqwad.tv.data.ads.AdRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
@Composable fun AdBreakOverlay(ad:AdBreak,repository:AdRepository,onFinished:()->Unit){
 val scope=rememberCoroutineScope();var elapsed by remember{mutableIntStateOf(0)}
 LaunchedEffect(ad.id){runCatching{repository.track(ad.id,"impression")};while(elapsed<ad.durationSeconds){delay(1000);elapsed++;if(elapsed==ad.durationSeconds/4)repository.track(ad.id,"quartile_25",elapsed);if(elapsed==ad.durationSeconds/2)repository.track(ad.id,"quartile_50",elapsed);if(elapsed==ad.durationSeconds*3/4)repository.track(ad.id,"quartile_75",elapsed)};repository.track(ad.id,"complete",elapsed);onFinished()}
 Card(Modifier.fillMaxWidth().padding(12.dp)){Column(Modifier.padding(14.dp)){
  Text("ADVERTISEMENT",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.secondary)
  AsyncImage(ad.creativeUrl,ad.title,Modifier.fillMaxWidth().height(120.dp))
  Text(ad.title,style=MaterialTheme.typography.titleMedium)
  Text("Ad break • "+(ad.durationSeconds-elapsed).coerceAtLeast(0)+"s remaining")
  val skip=ad.skipAfterSeconds
  if(skip!=null&&elapsed>=skip)TextButton(onClick={scope.launch{repository.track(ad.id,"skip",elapsed);onFinished()}}){Text("Skip ad")}
 }}
}
