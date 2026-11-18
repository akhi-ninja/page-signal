import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {community} from '../lib/community.mjs';
const env={PAGESIGNAL_ADMIN_GITHUB_IDS:'5537438'};
const origin='https://example.com';
const request=(method='GET',data,url='/api/community',from=origin)=>new Request(origin+url,{method,headers:{Origin:from,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
test('community requires verified sessions and checks origin before any database access',async()=>{
 let queries=0;const runtime={origin,pool:{query(){queries++;throw Error('unexpected query');}},auth:{api:{getSession:async()=>null}}};
 const dependencies={getRuntime:()=>runtime};
 assert.equal((await community(request(),env,dependencies)).status,401);
 assert.equal((await community(request('PUT',{},'/api/community','https://attacker.example'),env,dependencies)).status,403);
 runtime.auth.api.getSession=async()=>({user:{id:'x',emailVerified:false}});
 assert.equal((await community(request(),env,dependencies)).status,403);
 assert.equal(queries,0);
});
test('registration ownership, consent, withdrawal and admin data boundaries use real SQL',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "user"(id text PRIMARY KEY,name text,email text,"createdAt" timestamptz DEFAULT now());
   CREATE TABLE account("userId" text,"providerId" text,"accountId" text);
   CREATE TABLE pagesignal_usage(subject text,day date,requests integer);
   INSERT INTO "user"(id,name,email) VALUES ('owner','Owner','owner@example.com'),('visitor','Visitor','visitor@example.com');
   INSERT INTO account VALUES('owner','github','5537438'),('visitor','github','123');
   INSERT INTO pagesignal_usage VALUES('account:owner',current_date,3),('account:visitor',current_date,2),('global',current_date,5);`);
  let userId='visitor';const runtime={origin,pool:db,auth:{api:{getSession:async()=>({user:{id:userId,name:userId,email:userId+'@example.com',emailVerified:true}})}}};
  const deps={getRuntime:()=>runtime};const input={organization:'Example Co',use_case:'Invoice extraction',integration:'core',consent:true,contact_opt_in:false,user_id:'owner'};
  assert.equal((await community(request('PUT',{...input,consent:false}),env,deps)).status,400);
  assert.equal((await community(request('PUT',input),env,deps)).status,200);
  const own=await(await community(request(),env,deps)).json();assert.equal(own.profile.integration,'core');assert.equal(own.profile.contact_opt_in,false);assert.equal(own.isAdmin,false);
  assert.equal((await community(request('GET',undefined,'/api/community?view=admin'),env,deps)).status,403);
  assert.equal((await community(request('PUT',input),env,deps)).status,429);
  userId='owner';const owner=await(await community(request(),env,deps)).json();assert.equal(owner.profile,null);assert.equal(owner.isAdmin,true);
  const admin=await(await community(request('GET',undefined,'/api/community?view=admin'),env,deps)).json();assert.equal(admin.summary.accounts,2);assert.equal(admin.summary.registrations,1);assert.equal(admin.summary.requests_30d,5);assert.equal(admin.daily[0].requests,5);assert.match(admin.daily[0].day,/^\d{4}-\d{2}-\d{2}$/);assert.equal(admin.users.find(u=>u.id==='visitor').last_ai_day,admin.daily[0].day);assert.equal(admin.users.find(u=>u.id==='visitor').requests_today,2);
  assert.equal((await community(request('GET',undefined,'/api/community?view=admin'),{},deps)).status,403);
  assert.equal((await community(request('GET',undefined,'/api/community?view=admin&page=0'),env,deps)).status,400);
  userId='visitor';assert.equal((await community(request('DELETE'),env,deps)).status,200);assert.equal((await(await community(request(),env,deps)).json()).profile,null);
  const oversized={...input,use_case:'x'.repeat(9000)};assert.equal((await community(request('PUT',oversized),env,deps)).status,413);
 }finally{await db.close();}
});
