import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.discriminatedUnion("action",[
 z.object({action:z.literal("SETTINGS"),channelId:z.string().trim().min(1).max(80),enabled:z.boolean(),slowModeSeconds:z.number().int().min(0).max(300),subscriberOnly:z.boolean(),blockLinks:z.boolean(),reason:z.string().trim().min(3).max(1000)}),
 z.object({action:z.literal("MODERATE"),channelId:z.string().trim().min(1).max(80),messageId:z.string().trim().min(1).max(100),operation:z.enum(["DELETE","PIN","UNPIN"]),reason:z.string().trim().min(3).max(1000)}),
 z.object({action:z.literal("TIMEOUT"),channelId:z.string().trim().min(1).max(80),uid:z.string().trim().min(1).max(128),minutes:z.union([z.literal(10),z.literal(60),z.literal(1440)]),reason:z.string().trim().min(3).max(1000)}),
 z.object({action:z.literal("BAN"),channelId:z.string().trim().min(1).max(80),uid:z.string().trim().min(1).max(128),shadow:z.boolean().default(false),reason:z.string().trim().min(3).max(1000)}),
]);
export const Route=createFileRoute("/api/public/v1/zillionaire/live-chat/")({server:{handlers:{
 GET:async({request})=>{try{const user=await requireUser(request);const fs=await Firestore.create();await requireZillionaireModule(fs,user,"moderation");const reports=await fs.query("liveChatReports",{orderByField:"createdAt",descending:true,limit:100});const channels=await fs.query("channels",{limit:100});return Response.json({reports:reports.filter(r=>r["status"]==="OPEN").map(r=>({id:r.__id,channelId:r["channelId"],messageId:r["messageId"],reason:r["reason"],createdAt:r["createdAt"]})),channels:channels.filter(c=>c["liveChatSettings"]!==undefined).map(c=>({id:c.__id,name:c["name"]||c["title"]||"Live channel",settings:c["liveChatSettings"]}))});}catch(e){return errorBody(e);}},
 POST:async({request})=>{try{const user=await requireUser(request);const body=await parseBody(request,schema);const fs=await Firestore.create();await requireZillionaireModule(fs,user,"moderation");const channel=await fs.getDoc(`channels/${body.channelId}`);if(!channel||channel["published"]!==true)throw new ApiError(404,"CHANNEL_NOT_FOUND","This channel does not exist.");const before=body.action==="SETTINGS"?channel["liveChatSettings"]:null;let targetId=body.channelId;let after:unknown;
 if(body.action==="SETTINGS"){after={enabled:body.enabled,slowModeSeconds:body.slowModeSeconds,subscriberOnly:body.subscriberOnly,blockLinks:body.blockLinks};await fs.patchDoc(`channels/${body.channelId}`,{liveChatSettings:after});}
 else if(body.action==="MODERATE"){targetId=body.messageId;const path=`channels/${body.channelId}/liveChat/${body.messageId}`;const message=await fs.getDoc(path);if(!message)throw new ApiError(404,"CHAT_MESSAGE_NOT_FOUND","This message does not exist.");after=body.operation==="DELETE"?{status:"DELETED",moderatedAt:new Date().toISOString(),moderatedBy:user.uid}:{pinned:body.operation==="PIN",moderatedAt:new Date().toISOString(),moderatedBy:user.uid};await fs.patchDoc(path,after as Record<string,unknown>);}
 else {targetId=body.uid;const path=`channels/${body.channelId}/liveChatMutes/${body.uid}`;if(body.action==="TIMEOUT"){after={expiresAt:new Date(Date.now()+body.minutes*60_000).toISOString(),reason:body.reason,moderatedBy:user.uid};await fs.setDoc(path,after as Record<string,unknown>);}else{after={banned:true,shadow:body.shadow,reason:body.reason,moderatedBy:user.uid,createdAt:new Date().toISOString()};await fs.setDoc(path,after as Record<string,unknown>);}}
 await writeAuditLog(fs,{actorUid:user.uid,action:`live_chat.${body.action.toLowerCase()}`,targetType:body.action==="SETTINGS"?"channel":"live_chat",targetId,reason:body.reason,before,after,metadata:{channelId:body.channelId}});return Response.json({updated:true});}catch(e){return errorBody(e);}}
}}});
