package com.bqsqwad.tv.data.wallet

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ConsumeParams
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.google.firebase.auth.FirebaseAuth
import java.security.MessageDigest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class PlayBillingManager(
    context: Context,
    private val repository: WalletRepository,
    private val scope: CoroutineScope,
    private val onMessage: (String) -> Unit,
    private val onWalletUpdated: () -> Unit,
) {
    private val client =
        BillingClient
            .newBuilder(context)
            .setListener(::onPurchasesUpdated)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build()
    private var details: Map<String, ProductDetails> = emptyMap()

    fun connect(onReady: () -> Unit) {
        if (client.isReady) {
            onReady()
            return
        }
        client.startConnection(
            object : BillingClientStateListener {
                override fun onBillingSetupFinished(result: BillingResult) {
                    if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                        onReady()
                    } else {
                        onMessage("Google Play Billing is unavailable: " + result.debugMessage)
                    }
                }

                override fun onBillingServiceDisconnected() {
                    onMessage("Google Play connection lost. Reopen Wallet to retry.")
                }
            },
        )
    }

    fun loadProducts(onLoaded: (List<Pair<PlayProductOffer, ProductDetails>>) -> Unit) {
        scope.launch(Dispatchers.IO) {
            runCatching { repository.products() }
                .onSuccess { offers ->
                    val params =
                        QueryProductDetailsParams
                            .newBuilder()
                            .setProductList(
                                offers.map {
                                    QueryProductDetailsParams.Product
                                        .newBuilder()
                                        .setProductId(
                                            it.productId,
                                        ).setProductType(BillingClient.ProductType.INAPP)
                                        .build()
                                },
                            ).build()
                    client.queryProductDetailsAsync(params) { billingResult, queryResult ->
                        if (billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
                            onMessage("Could not load top-up products: " + billingResult.debugMessage)
                        } else {
                            details = queryResult.productDetailsList.associateBy { it.productId }
                            onLoaded(offers.mapNotNull { offer -> details[offer.productId]?.let { offer to it } })
                        }
                    }
                }.onFailure { onMessage(it.localizedMessage ?: "Could not load wallet products.") }
        }
    }

    fun purchase(
        activity: Activity,
        productId: String,
    ) {
        val product =
            details[productId] ?: run {
                onMessage("This top-up is not available in Google Play.")
                return
            }
        val params =
            BillingFlowParams.ProductDetailsParams
                .newBuilder()
                .setProductDetails(product)
                .build()
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        if (uid.isNullOrBlank()) {
            onMessage("Sign in before purchasing wallet credits.")
            return
        }
        val obfuscatedAccountId =
            MessageDigest
                .getInstance("SHA-256")
                .digest(uid.toByteArray(Charsets.UTF_8))
                .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
        val flowParams =
            BillingFlowParams
                .newBuilder()
                .setProductDetailsParamsList(listOf(params))
                .setObfuscatedAccountId(obfuscatedAccountId)
                .build()
        val result = client.launchBillingFlow(activity, flowParams)
        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            onMessage(result.debugMessage)
        }
    }

    fun restore() {
        client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
        ) { result, purchases ->
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                purchases.forEach(::processPurchase)
            } else {
                onMessage("Could not check previous purchases: " + result.debugMessage)
            }
        }
    }

    private fun onPurchasesUpdated(
        result: BillingResult,
        purchases: MutableList<Purchase>?,
    ) {
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> purchases.orEmpty().forEach(::processPurchase)
            BillingClient.BillingResponseCode.USER_CANCELED -> onMessage("Purchase cancelled.")
            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> restore()
            else -> onMessage("Purchase not completed: " + result.debugMessage)
        }
    }

    private fun processPurchase(purchase: Purchase) {
        when (purchase.purchaseState) {
            Purchase.PurchaseState.PENDING -> onMessage("Your payment is pending. Credits will appear after Google confirms payment.")
            Purchase.PurchaseState.UNSPECIFIED_STATE -> onMessage("Google Play returned an unverified purchase state.")
            Purchase.PurchaseState.PURCHASED -> {
                val productId = purchase.products.firstOrNull() ?: return
                scope.launch(Dispatchers.IO) {
                    runCatching { repository.verify(productId, purchase.purchaseToken, purchase.orderId) }
                        .onSuccess { verification ->
                            if (verification.processed) {
                                val consume = ConsumeParams.newBuilder().setPurchaseToken(purchase.purchaseToken).build()
                                client.consumeAsync(consume) { billingResult, _ ->
                                    if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                                        onMessage(
                                            if (verification.credited) {
                                                "Wallet credited successfully."
                                            } else {
                                                "This purchase was already credited to your wallet."
                                            },
                                        )
                                        onWalletUpdated()
                                    } else {
                                        onMessage(
                                            "The verified purchase is ready, but Google Play consumption needs retry: " +
                                                billingResult.debugMessage,
                                        )
                                    }
                                }
                            } else {
                                onMessage(verification.message ?: "The server has not confirmed this purchase. It will not be consumed.")
                            }
                        }.onFailure { onMessage("Purchase verification failed. Do not repurchase yet. " + (it.localizedMessage ?: "")) }
                }
            }
        }
    }

    fun close() {
        if (client.isReady)client.endConnection()
    }
}
