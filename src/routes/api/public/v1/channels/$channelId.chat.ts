import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getUserProfile, requireAdultForContent, requireUser, parseBody } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const sendSchema = z.object({
  action: z.literal("SEND"),
  body: z.string().trim().min(1).max(500),
  replyTo: z.string().trim().max(80).optional(),
});
const reactSchema = z.object({ action: z.literal("REACT"), messageId: z.string().trim().min(1).max(80), reaction: z.enum(["❤️", "👍", "😂", "👏", "😮"]) });
const reportSchema = z.object({ action: z.literal("REPORT"), messageId: z.string().trim().min(1).max(80), reason: z.enum(["spam", "abuse", "personal_information", "other"]) });
const bodySchema = z.discriminatedUnion("action", [sendSchema, reactSchema, reportSchema]);
const clean = (value: string) => Array.from(value).filter((c) => { const n=c.charCodeAt(0); return n===9||n===10||n===13||(n>=32&&n!==127); }).join("").trim();

export const Route = createFileRoute("/api/public/v1/channels/$channelId/chat")({
  server: { handlers: {
    GET: async ({ request, params }) => {
      try {
        const user = await requireUser(request); const fs = await Firestore.create(); const id=params.channelId;
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new ApiError(400,"INVALID_REQUEST","Invalid channel id.");
        const channel=await fs.getDoc(`channels/${id}`); if(!channel||channel["published"]!==true) throw new ApiError(404,"CHANNEL_NOT_FOUND","This channel does not exist.");
        const profile=await fs.getDoc(`users/${user.uid}`); const userProfile=await getUserProfile(fs,user.uid); requireAdultForContent(userProfile,channel["adultOnly"]); const settings=(channel["liveChatSettings"]||{}) as Record<string,unknown>;
        const child=profile?.["childProfile"]===true||profile?.["childMode"]===true||profile?.["profileType"]==="child";
        if(child||settings["enabled"]!==true) return Response.json({enabled:false,messages:[],slowModeSeconds:0});
        const muted=await fs.getDoc(`channels/${id}/liveChatMutes/${user.uid}`);
        if(muted?.["banned"]===true) return Response.json({enabled:true,mutedUntil:null,messages:[]});
        if(muted&&typeof muted["expiresAt"]==="string"&&Date.parse(muted["expiresAt"])>Date.now()) return Response.json({enabled:true,mutedUntil:muted["expiresAt"],messages:[]});
        const messages=await fs.query(`channels/${id}/liveChat`,{orderByField:"createdAt",descending:true,limit:100});
        return Response.json({enabled:true,slowModeSeconds:Number(settings["slowModeSeconds"]||0),subscriberOnly:settings["subscriberOnly"]===true,messages:messages.filter(m=>m["status"]!=="DELETED"&&m["status"]!=="SHADOW_BANNED").reverse().map(m=>({id:m.__id,body:m["body"],author:m["authorLabel"]||"Viewer",replyTo:m["replyTo"]||null,reactions:m["reactions"]||{},createdAt:m["createdAt"]}))});
      } catch(error){return errorBody(error);}
    },
    POST: async ({ request, params }) => {
      try {
        const user=await requireUser(request); const body=await parseBody(request,bodySchema); const fs=await Firestore.create(); const id=params.channelId;
        const channel=await fs.getDoc(`channels/${id}`); if(!channel||channel["published"]!==true) throw new ApiError(404,"CHANNEL_NOT_FOUND","This channel does not exist.");
        const settings=(channel["liveChatSettings"]||{}) as Record<string,unknown>;
        if(settings["enabled"]!==true) throw new ApiError(403,"CHAT_DISABLED","Chat is not available on this channel.");
        const profile=await fs.getDoc(`users/${user.uid}`); const userProfile=await getUserProfile(fs,user.uid); requireAdultForContent(userProfile,channel["adultOnly"]);
        const existingMute=await fs.getDoc(`channels/${id}/liveChatMutes/${user.uid}`);
        if(existingMute?.["banned"]===true||(typeof existingMute?.["expiresAt"]==="string"&&Date.parse(existingMute["expiresAt"] as string)>Date.now())) throw new ApiError(403,"CHAT_MUTED","You cannot send messages in this channel right now.");
        if(profile?.["childProfile"]===true||profile?.["childMode"]===true||profile?.["profileType"]==="child") throw new ApiError(403,"CHAT_CHILD_PROFILE","Chat is turned off for children’s profiles.");
        if(settings["subscriberOnly"]===true){ const subscription=await fs.getDoc(`users/${user.uid}/subscriptions/${id}`); if(!subscription||subscription["status"]!=="active") throw new ApiError(403,"CHAT_SUBSCRIBER_ONLY","Join this channel to chat."); }
        if(body.action==="SEND"){
          await enforceRateLimit(fs,`live-chat:${id}:${user.uid}`,{limit:10,windowMs:60_000});
          const previous=await fs.query(`channels/${id}/liveChat`,{filters:[{field:"authorUid",op:"EQUAL",value:user.uid}],orderByField:"createdAt",descending:true,limit:1});
          const last=previous[0]?.["createdAt"]; const slow=Number(settings["slowModeSeconds"]||0);
          if(slow>0&&typeof last==="string"&&Date.now()-Date.parse(last)<slow*1000) throw new ApiError(429,"CHAT_SLOW_MODE","Please wait before sending another message.");
          const text=clean(body.body); if(!text) throw new ApiError(400,"CHAT_EMPTY","Enter a message first.");
          if(settings["blockLinks"]===true&&/(https?:\/\/|www\.)/i.test(text)) throw new ApiError(400,"CHAT_LINK_BLOCKED","Links are not allowed in this chat.");
          const config=await fs.getDoc("moderationConfig/keywords"); const words=Array.isArray(config?.["keywords"])?config!["keywords"] as string[]:[]; const lowered=text.toLowerCase();
          const blocked=words.some(word=>typeof word==="string"&&word.trim()&&lowered.includes(word.trim().toLowerCase()));
          const messageId=crypto.randomUUID().replace(/-/g,""); const createdAt=new Date().toISOString();
          await fs.setDoc(`channels/${id}/liveChat/${messageId}`,{channelId:id,authorUid:user.uid,authorLabel:typeof profile?.["userNumber"]==="string"?`Viewer ${profile["userNumber"]}`:"Viewer",body:text,replyTo:body.replyTo||null,reactions:{},status:profile?.["shadowBanned"]===true?"SHADOW_BANNED":blocked?"FLAGGED":"VISIBLE",createdAt},{mustNotExist:true});
          return Response.json({messageId,status:profile?.["shadowBanned"]===true?"SHADOW_BANNED":blocked?"FLAGGED":"VISIBLE"},{status:201});
        }
        const message=await fs.getDoc(`channels/${id}/liveChat/${body.messageId}`); if(!message) throw new ApiError(404,"CHAT_MESSAGE_NOT_FOUND","This message is no longer available.");
        if(body.action==="REPORT"){
          await enforceRateLimit(fs,`live-chat-report:${user.uid}`,{limit:5,windowMs:60*60_000}); const reportId=crypto.randomUUID().replace(/-/g,"");
          await fs.setDoc(`liveChatReports/${reportId}`,{channelId:id,messageId:body.messageId,reporterUid:user.uid,reason:body.reason,status:"OPEN",createdAt:new Date().toISOString()},{mustNotExist:true});
          return Response.json({reported:true},{status:201});
        }
        const reactions=(message["reactions"]&&typeof message["reactions"]==="object"?message["reactions"]:{}) as Record<string,string[]>; const users=new Set(reactions[body.reaction]||[]);
        if(users.has(user.uid)) users.delete(user.uid); else users.add(user.uid); reactions[body.reaction]=Array.from(users).slice(-500);
        await fs.patchDoc(`channels/${id}/liveChat/${body.messageId}`,{reactions}); return Response.json({reacted:true});
      }catch(error){return errorBody(error);}
    },
  }},
});
