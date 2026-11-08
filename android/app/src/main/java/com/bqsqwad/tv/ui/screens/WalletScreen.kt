package com.bqsqwad.tv.ui.screens

import android.app.Activity
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.bqsqwad.tv.data.wallet.*
import kotlinx.coroutines.launch

@Composable
fun WalletScreen(onBack:()->Unit){
 val context=LocalContext.current
 val activity=context as? Activity
 val scope=rememberCoroutineScope()
 val repo=remember{WalletRepository()}
 var wallet by remember{mutableStateOf<WalletSummary?>(null)}
 var ledger by remember{mutableStateOf<List<LedgerEntry>>(emptyList())}
 var products by remember{mutableStateOf<List<Pair<PlayProductOffer,com.android.billingclient.api.ProductDetails>>>(emptyList())}
 var message by remember{mutableStateOf<String?>(null)}
 var loading by remember{mutableStateOf(true)}
 val manager=remember{PlayBillingManager(context,repo,scope,{message=it},{scope.launch{runCatching{repo.wallet()}.onSuccess{wallet=it}}})}
 DisposableEffect(manager){manager.connect{manager.loadProducts{products=it};manager.restore()};onDispose{manager.close()}}
 fun refresh(){scope.launch{loading=true;runCatching{repo.wallet()}.onSuccess{wallet=it}.onFailure{message=it.localizedMessage};runCatching{repo.ledger()}.onSuccess{ledger=it.items};loading=false}}
 LaunchedEffect(Unit){refresh()}
 Column(Modifier.fillMaxSize().padding(18.dp)){
  TextButton(onClick=onBack){Text("← Back")}
  Text("Your wallet",style=MaterialTheme.typography.headlineMedium)
  Card(Modifier.fillMaxWidth()){Column(Modifier.padding(20.dp)){
   Text("AVAILABLE BALANCE",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
   Text(wallet?.let{money(it.balanceMinor,it.currency)}?:if(loading)"Loading…" else "—",style=MaterialTheme.typography.headlineLarge,color=MaterialTheme.colorScheme.primary)
   wallet?.let{w->if(w.dailySpendLimitMinor!=null)Text("Daily limit: "+money(w.dailySpendLimitMinor,w.currency)+" • spent "+money(w.spentTodayMinor?:0,w.currency),style=MaterialTheme.typography.bodySmall)}
  }}
  Spacer(Modifier.height(16.dp));Text("Top up with Google Play",style=MaterialTheme.typography.titleLarge)
  if(products.isEmpty())Text("Google Play top-ups are loading or are not configured.",color=MaterialTheme.colorScheme.onSurfaceVariant)
  products.forEach{(offer,details)->
   ListItem(headlineContent={Text(offer.title)},supportingContent={Text(offer.credits.toString()+" credits"+(offer.description?.let{" • "+it}?: ""))},trailingContent={Button(onClick={if(activity!=null)manager.purchase(activity,offer.productId)}){Text(details.oneTimePurchaseOfferDetails?.formattedPrice?: "Buy")}})
  }
  TextButton(onClick={manager::restore}){Text("Restore / check previous purchases")}
  message?.let{Text(it,color=MaterialTheme.colorScheme.secondary)}
  Spacer(Modifier.height(12.dp));Text("Recent activity",style=MaterialTheme.typography.titleLarge)
  LazyColumn{items(ledger,key={it.id}){entry->ListItem(headlineContent={Text(entry.description)},supportingContent={Text(entry.createdAt+" • "+entry.kind)},trailingContent={Text(money(entry.amountMinor,wallet?.currency?:"NGN"))})}}
 }
}
private fun money(minor:Long,currency:String)=currency+" "+String.format("%.2f",minor/100.0)
