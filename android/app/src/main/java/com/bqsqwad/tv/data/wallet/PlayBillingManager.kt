package com.bqsqwad.tv.data.wallet

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class PlayBillingManager(
    context:Context,
    private val repository:WalletRepository,
    private val scope:CoroutineScope,
    private val onMessage:(String)->Unit,
    private val onWalletUpdated:()->Unit
) {
    private val client=BillingClient.newBuilder(context)
        .setListener(::onPurchasesUpdated)
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .build()
    private var details:Map<String,ProductDetails> = emptyMap()

    fun connect(onReady:()->Unit) {
        if(client.isReady){onReady();return}
        client.startConnection(object:BillingClientStateListener{
            override fun onBillingSetupFinished(result:BillingResult){
                if(result.responseCode==BillingClient.BillingResponseCode.OK) onReady()
                else onMessage("Google Play Billing is unavailable: "+result.debugMessage)
            }
            override fun onBillingServiceDisconnected(){onMessage("Google Play connection lost. Reopen Wallet to retry.")}
        })
    }

    fun loadProducts(onLoaded:(List<Pair<PlayProductOffer,ProductDetails>>)->Unit) {
        scope.launch(Dispatchers.IO) {
            runCatching { repository.products() }.onSuccess { offers ->
                val params=QueryProductDetailsParams.newBuilder().setProductList(
                    offers.map{QueryProductDetailsParams.Product.newBuilder().setProductId(it.productId).setProductType(BillingClient.ProductType.INAPP).build()}
                ).build()
                client.queryProductDetailsAsync(params){result->
                    if(result.billingResult.responseCode!=BillingClient.BillingResponseCode.OK){
                        onMessage("Could not load top-up products: "+result.billingResult.debugMessage)
                    }else{
                        details=result.productDetailsList.associateBy{it.productId}
                        onLoaded(offers.mapNotNull{offer->details[offer.productId]?.let{offer to it}})
                    }
                }
            }.onFailure{onMessage(it.localizedMessage?: "Could not load wallet products.")}
        }
    }

    fun purchase(activity:Activity,productId:String){
        val product=details[productId] ?: run{onMessage("This top-up is not available in Google Play.");return}
        val params=BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product).build()
        val result=client.launchBillingFlow(activity,BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(params)).build())
        if(result.responseCode!=BillingClient.BillingResponseCode.OK)onMessage(result.debugMessage)
    }

    fun restore(){
        client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build()){result,purchases->
            if(result.responseCode==BillingClient.BillingResponseCode.OK)purchases.forEach(::processPurchase)
            else onMessage("Could not check previous purchases: "+result.debugMessage)
        }
    }

    private fun onPurchasesUpdated(result:BillingResult,purchases:MutableList<Purchase>?){
        when(result.responseCode){
            BillingClient.BillingResponseCode.OK->purchases.orEmpty().forEach(::processPurchase)
            BillingClient.BillingResponseCode.USER_CANCELED->onMessage("Purchase cancelled.")
            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED->restore()
            else->onMessage("Purchase not completed: "+result.debugMessage)
        }
    }

    private fun processPurchase(purchase:Purchase){
        when(purchase.purchaseState){
            Purchase.PurchaseState.PENDING->onMessage("Your payment is pending. Credits will appear after Google confirms payment.")
            Purchase.PurchaseState.UNSPECIFIED_STATE->onMessage("Google Play returned an unverified purchase state.")
            Purchase.PurchaseState.PURCHASED->{
                val productId=purchase.products.firstOrNull() ?: return
                scope.launch(Dispatchers.IO){
                    runCatching{repository.verify(productId,purchase.purchaseToken,purchase.orderId)}
                        .onSuccess{verification->
                            if(verification.credited){
                                val consume=ConsumeParams.newBuilder().setPurchaseToken(purchase.purchaseToken).build()
                                client.consumeAsync(consume){billingResult,_->
                                    if(billingResult.responseCode==BillingClient.BillingResponseCode.OK){
                                        onMessage("Wallet credited successfully.")
                                        onWalletUpdated()
                                    }else onMessage("Wallet was credited, but Google Play consumption needs retry: "+billingResult.debugMessage)
                                }
                            }else onMessage(verification.message ?: "The server has not confirmed this purchase. It will not be consumed.")
                        }.onFailure{onMessage("Purchase verification failed. Do not repurchase yet. "+(it.localizedMessage?: ""))}
                }
            }
        }
    }

    fun close(){if(client.isReady)client.endConnection()}
}
