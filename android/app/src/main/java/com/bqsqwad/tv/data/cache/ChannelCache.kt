package com.bqsqwad.tv.data.cache
import androidx.room.*
@Entity(tableName="channel_cache",primaryKeys=["id","section"])
data class CachedChannel(val id:String,val section:String,val title:String,val category:String,val posterUrl:String?,val isLive:Boolean,val currentProgramme:String?,val language:String?,val cachedAtMillis:Long)
@Dao interface ChannelCacheDao{
 @Query("SELECT * FROM channel_cache WHERE section=:section ORDER BY title") suspend fun inSection(section:String):List<CachedChannel>
 @Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun putAll(items:List<CachedChannel>)
 @Query("DELETE FROM channel_cache WHERE cachedAtMillis < :olderThan") suspend fun prune(olderThan:Long)
}
@Database(entities=[CachedChannel::class],version=1,exportSchema=false)
abstract class BqTvDatabase:RoomDatabase(){abstract fun channelCache():ChannelCacheDao}
