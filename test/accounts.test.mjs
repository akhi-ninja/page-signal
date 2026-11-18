import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountExtract, accountStatus } from '../lib/account-api.mjs';
import { authConfiguration } from '../lib/auth.mjs';
import { reserveAiRequest, usageSchema } from '../lib/usage.mjs';
import { PGlite } from '@electric-sql/pglite';

const env={OPENAI_API_KEY:'test'};
const request=(origin='https://example.com')=>new Request('https://example.com/api/ai/extract',{
 method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({image:'data:image/jpeg;base64,AA==',text:''})
});
const runtime=user=>({origin:'https://example.com',providers:{github:true},pool:{},auth:{api:{getSession:async()=>user?{user}:null}}});
const user={id:'verified-user',emailVerified:true,name:'Example',email:'example@example.com'};
test('hosted AI fails closed without auth configuration',async()=>{
 let called=false;const r=await accountExtract(request(),env,{getRuntime:()=>null,extract:()=>{called=true;}});
 assert.equal(r.status,503);assert.equal(called,false);
});
test('anonymous, unverified and cross-origin requests never reach quota or provider',async()=>{
 for(const [identity,origin,expected] of [[null,'https://example.com',401],[{...user,emailVerified:false},'https://example.com',403],[user,'https://attacker.example',403]]){
  let calls=0;const r=await accountExtract(request(origin),env,{getRuntime:()=>runtime(identity),reserve:()=>{calls++;},extract:()=>{calls++;}});
  assert.equal(r.status,expected);assert.equal(calls,0);
 }
});
test('exhausted quota rejects before provider access',async()=>{
 let called=false;const r=await accountExtract(request(),env,{getRuntime:()=>runtime(user),reserve:async()=>({allowed:false,reason:'Limit reached'}),extract:()=>{called=true;}});
 assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'60');assert.equal(called,false);
});
test('authorized request reserves usage under verified server identity',async()=>{
 const r=await accountExtract(request(),env,{getRuntime:()=>runtime(user),reserve:async(pool,id)=>{assert.equal(id,user.id);return {allowed:true,remaining:19};},extract:async r=>{
  assert.equal(r.headers.get('origin'),'https://example.com');assert.equal((await r.json()).text,'');return Response.json({document_type:'invoice'});
 }});
 assert.equal(r.status,200);assert.equal(r.headers.get('x-pagesignal-requests-remaining'),'19');
});
test('forged cookie receives no identity from status',async()=>{
 const r=await accountStatus(new Request('https://example.com/api/ai/status',{headers:{Cookie:'userId=admin; authenticated=true'}}),env,{getRuntime:()=>runtime(null)});
 const data=await r.json();assert.equal(data.user,null);assert.equal(data.authRequired,true);assert(!('usage' in data));
});
test('quota storage outages reject AI without provider access',async()=>{
 let called=false;const r=await accountExtract(request(),env,{getRuntime:()=>runtime(user),reserve:async()=>{throw new Error('database offline');},extract:()=>{called=true;}});
 assert.equal(r.status,503);assert.equal(called,false);
});
test('auth origin config disallows insecure remote URLs and weak secrets',()=>{
 const valid={BETTER_AUTH_URL:'https://example.com',BETTER_AUTH_SECRET:'f'.repeat(40),DATABASE_URL:'postgres://localhost/test'};
 assert.equal(authConfiguration(valid).origin,'https://example.com');
 for(const override of [{BETTER_AUTH_URL:'http://example.com'},{BETTER_AUTH_URL:'https://example.com/path'},{BETTER_AUTH_SECRET:'short'}])assert.equal(authConfiguration({...valid,...override}),null);
});
test('Postgres quota SQL enforces minute/day/global limits and rolls back denied reservations',async()=>{
 const db=new PGlite();await db.exec(usageSchema);
 const pool={connect:async()=>({query:(sql,args)=>db.query(sql,args),release(){}})};
 const limits={daily:3,perMinute:2,globalDaily:4};
 const now=new Date('2026-11-18T12:00:00Z'),next=new Date('2026-11-18T12:01:00Z');
 try{
  assert.equal((await reserveAiRequest(pool,'alice',limits,now)).remaining,2);
  assert.equal((await reserveAiRequest(pool,'alice',limits,now)).remaining,1);
  assert.equal((await reserveAiRequest(pool,'alice',limits,now)).allowed,false);
  assert.equal((await reserveAiRequest(pool,'alice',limits,next)).remaining,0);
  assert.equal((await reserveAiRequest(pool,'alice',limits,new Date('2026-11-18T13:00:00Z'))).allowed,false);
  assert.equal((await reserveAiRequest(pool,'bob',limits,next)).allowed,true);
  assert.equal((await reserveAiRequest(pool,'charlie',limits,next)).allowed,false);
  const rows=await db.query("SELECT requests FROM pagesignal_usage WHERE subject='global'");assert.equal(rows.rows[0].requests,4);
  assert.equal((await reserveAiRequest(pool,'alice',limits,new Date('2026-11-19T00:00:00Z'))).allowed,true);
 }finally{await db.close();}
});

test('invalid payload and oversized streamed body do not reserve quota',async()=>{
 for(const [body,status] of [['{}',400],[JSON.stringify({operation:'document_query',mode:'fields',question:'notice',context:'',pages:[{page:1,text:''}]}),400],['x'.repeat(4000001),413]]){
  let calls=0;const req=new Request('https://example.com/api/ai/extract',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body});
  const r=await accountExtract(req,env,{getRuntime:()=>runtime(user),reserve:()=>{calls++;},extract:()=>{calls++;}});assert.equal(r.status,status);assert.equal(calls,0);
 }
});
