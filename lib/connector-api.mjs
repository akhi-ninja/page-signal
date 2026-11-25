import {getAuthRuntime} from './auth.mjs';
import {listConnections,createConnection,deleteConnection,validateConnection} from './connector-store.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function handleConnections(request,env=process.env,deps={}){
 if(env.PAGESIGNAL_CONNECTIONS_ENABLED!=='true')return json({error:'Connection storage is disabled'},503);
 const runtime=(deps.getRuntime||getAuthRuntime)(env);
 if(!runtime)return json({error:'Sign-in unavailable'},503);
 if(!['GET','POST','DELETE'].includes(request.method))return json({error:'Unsupported method'},405);
 if(new URL(request.url).origin!==runtime.origin)return json({error:'Invalid origin'},403);
 if(request.method!=='GET'&&(request.headers.get('origin')!==runtime.origin||!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||'')))return json({error:'Invalid origin or content type'},403);
 try{
 const session=await runtime.auth.api.getSession({headers:request.headers});
 if(!session?.user?.id)return json({error:'Sign in required'},401);
 if(!session.user.emailVerified)return json({error:'Verified email required'},403);
 const owner=session.user.id;
 if(request.method==='GET')return json({connections:await (deps.list||listConnections)(runtime.pool,owner)});
 let body;try{let size=0;const chunks=[];if(request.body)for await(const chunk of request.body){size+=chunk.length;if(size>400000)return json({error:'Request too large'},413);chunks.push(chunk)}body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!body||typeof body!=='object'||Array.isArray(body))throw Error()}catch{return json({error:'Invalid JSON'},400)}
 if(request.method==='DELETE'){if(typeof body.id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id))return json({error:'Invalid ID'},400);return (await (deps.remove||deleteConnection)(runtime.pool,owner,body.id))?json({deleted:true}):json({error:'Connection not found'},404)}
 try{validateConnection(body);if(body.auth==='None'?body.secret!==undefined:typeof body.secret!=='string'||!body.secret||Buffer.byteLength(body.secret)>16384)throw Error()}catch{return json({error:'Invalid connection configuration'},400)}
 return json({connection:await (deps.create||createConnection)(runtime.pool,owner,body,env)},201);
 }catch{return json({error:'Connection service unavailable'},503)}
}
