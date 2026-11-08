package com.bqsqwad.tv.ui.screens
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.bqsqwad.tv.data.catalog.*
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
@Composable fun SearchScreen(onBack:()->Unit,onChannel:(String)->Unit){
 val repo=remember{CatalogRepository()};val scope=rememberCoroutineScope()
 var query by remember{mutableStateOf("")};var results by remember{mutableStateOf<List<ChannelSummary>>(emptyList())}
 var filter by remember{mutableStateOf("all")};var error by remember{mutableStateOf<String?>(null)};var job by remember{mutableStateOf<Job?>(null)}
 fun search(value:String){job?.cancel();if(value.isBlank()){results=emptyList();return};job=scope.launch{delay(250);runCatching{repo.search(value,type=filter.takeIf{it!="all"})}.onSuccess{results=it.results;error=null}.onFailure{error=it.localizedMessage?: "Search unavailable."}}}
 Column(Modifier.fillMaxSize().padding(18.dp)){
  TextButton(onClick=onBack){Text("← Back")}
  OutlinedTextField(query,{query=it;search(it)},Modifier.fillMaxWidth(),label={Text("Search channels, matches, movies and shows")},singleLine=true)
  Spacer(Modifier.height(12.dp))
  Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){listOf("all","live","replay").forEach{v->FilterChip(selected=filter==v,onClick={filter=v;search(query)},label={Text(v.replaceFirstChar{it.uppercase()})})}}
  error?.let{Text(it,color=MaterialTheme.colorScheme.error)}
  LazyColumn(contentPadding=PaddingValues(vertical=12.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
   items(results,key={it.id}){item->ListItem(headlineContent={Text(item.title)},supportingContent={Text(item.category+(item.language?.let{" • "+it}?: ""))},trailingContent={if(item.isLive)Text("LIVE",color=MaterialTheme.colorScheme.error)},modifier=Modifier.clickable{onChannel(item.id)})}
  }
 }
}
