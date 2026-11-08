package com.bqsqwad.tv.ui
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import com.bqsqwad.tv.data.auth.AuthRepository
import com.bqsqwad.tv.ui.player.PlayerScreen
import com.bqsqwad.tv.ui.screens.*
@Composable fun BqSqwadTvApp(){
 val nav=rememberNavController();val auth=remember{AuthRepository()}
 Surface(Modifier.fillMaxSize()){
  NavHost(navController=nav,startDestination="signin"){
   composable("signin"){SignInScreen{nav.navigate("profile"){popUpTo("signin"){inclusive=true}}}}
   composable("profile"){ProfileSetupScreen(auth){nav.navigate("home"){popUpTo("profile"){inclusive=true}}}}
   composable("home"){HomeScreen(onSearch={nav.navigate("search")},onChannel={nav.navigate("channel/"+it)})}
   composable("search"){SearchScreen(onBack={nav.popBackStack()},onChannel={nav.navigate("channel/"+it)})}
   composable("channel/{id}",arguments=listOf(navArgument("id"){type=NavType.StringType})){entry->ChannelScreen(entry.arguments?.getString("id").orEmpty(),onBack={nav.popBackStack()},onPlay={nav.navigate("player/"+it)})}
   composable("player/{id}",arguments=listOf(navArgument("id"){type=NavType.StringType})){entry->PlayerScreen(entry.arguments?.getString("id").orEmpty(),null,onExit={nav.popBackStack()})}
  }
 }
}
