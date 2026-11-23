// Operator-invoked preview integration test. No route, credentials or raw model output are exposed.
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {getAuthRuntime} from '../lib/auth.mjs';
import {createJobStore} from '../lib/document-jobs.mjs';
import {documentJobs} from '../lib/job-api.mjs';
import {enqueueDocumentJob} from '../lib/job-queue.mjs';
import retention from '../api/internal/job-retention.mjs';
const stage=process.env.PAGESIGNAL_JOB_SMOKE,run=process.env.PAGESIGNAL_JOB_SMOKE_ID;
if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='development'||!['migrate','seed','verify','cleanup'].includes(stage)||!/^[-a-f0-9]{36}$/.test(run||''))throw Error('Explicit development-preview smoke configuration required');
if(process.env.PAGESIGNAL_DURABLE_JOBS!=='true'||!process.env.CRON_SECRET||process.env.CRON_SECRET.length<32)throw Error('Configure jobs and retention before verification');
const runtime=getAuthRuntime(process.env);if(!runtime)throw Error('Account runtime required');
const store=createJobStore(runtime.pool,process.env.BETTER_AUTH_SECRET),checks=[];
let record;
async function save(){await runtime.pool.query('INSERT INTO pagesignal_job_smoke_runs(id,record) VALUES($1,$2::jsonb) ON CONFLICT(id) DO UPDATE SET record=EXCLUDED.record',[run,JSON.stringify(record)]);}
async function cleanup(){
 if(!record)return;
 for(const id of record.jobs||[])await runtime.pool.query('DELETE FROM pagesignal_document_jobs WHERE id=$1 AND owner_id=ANY($2::text[])',[id,record.users]);
 for(const id of record.users||[]){await runtime.pool.query('DELETE FROM "session" WHERE "userId"=$1',[id]);await runtime.pool.query('DELETE FROM pagesignal_usage WHERE subject=$1',['account:'+id]);await runtime.pool.query('DELETE FROM "user" WHERE id=$1 AND email LIKE $2',[id,'%-'+run+'@example.invalid']);}
 await runtime.pool.query('DELETE FROM pagesignal_job_smoke_runs WHERE id=$1',[run]);
}
try{
 await runtime.pool.query('CREATE TABLE IF NOT EXISTS pagesignal_job_smoke_runs(id text PRIMARY KEY,record jsonb NOT NULL)');
 if(stage==='migrate'){await store.migrate();checks.push('additive_job_schema_ready');}
 else{
  record=(await runtime.pool.query('SELECT record FROM pagesignal_job_smoke_runs WHERE id=$1',[run])).rows[0]?.record;
  if(stage==='cleanup'){await cleanup();checks.push('synthetic_records_removed');}
  else{
   const context=await runtime.auth.$context;
   const cookie=async user=>{const session=await context.internalAdapter.createSession(user,false,{expiresAt:new Date(Date.now()+600000)},true);return context.authCookies.sessionToken.name+'='+encodeURIComponent(session.token+'.'+createHmac('sha256',process.env.BETTER_AUTH_SECRET).update(session.token).digest('base64'));};
   if(stage==='seed'){
    assert.ok(!record,'This smoke run was already seeded');record={users:[],jobs:[],createdAt:new Date().toISOString()};await save();
    for(const role of ['owner','stranger']){const user=await context.internalAdapter.createUser({email:role+'-'+run+'@example.invalid',emailVerified:true,name:'PageSignal synthetic readiness test'});record.users.push(user.id);await save();}
   }else assert.ok(record,'Smoke run not found');
   const ownerCookie=await cookie(record.users[0]),strangerCookie=await cookie(record.users[1]);
   const request=(method,id,body,session=ownerCookie,origin=runtime.origin)=>new Request(runtime.origin+'/api/ai/jobs'+(id?'?id='+id:''),{method,headers:{Origin:origin,'Content-Type':'application/json',...(session?{Cookie:session}:{})},...(body?{body:JSON.stringify(body)}:{})});
   const deps={enqueue:async(id,options)=>{if(!record.jobs.includes(id)){record.jobs.push(id);await save();}return enqueueDocumentJob(id,{...options,delaySeconds:stage==='seed'?90:0});}};
   const api=async(method,id,body,session,origin)=>documentJobs(request(method,id,body,session,origin),process.env,deps);
   assert.equal((await api('GET',record.main,undefined,'')).status,401);checks.push('actual_session_required');
   assert.equal((await api('POST',undefined,{},ownerCookie,'https://invalid.example')).status,403);checks.push('origin_rejected');
   if(stage==='seed'){
    const image='data:image/jpeg;base64,'+(await readFile('benchmark/fixtures/invoice-clean.jpg')).toString('base64');
    const page={page:1,image,text:'Invoice number: DEMO-104\nTotal: 45.00'};
    const created=await api('POST',null,{pages:[page,{...page,page:2}],idempotency_key:'smoke-main-'+run});assert.equal(created.status,202);record.main=(await created.json()).id;await save();
    const replay=await api('POST',null,{pages:[page,{...page,page:2}],idempotency_key:'smoke-main-'+run});assert.equal(replay.status,202);assert.equal((await replay.json()).created,false);checks.push('idempotent_authenticated_creation');
    const cancelled=await api('POST',null,{pages:[page],idempotency_key:'smoke-cancel-'+run});assert.equal(cancelled.status,202);record.cancelled=(await cancelled.json()).id;await save();assert.equal((await api('POST',record.cancelled,{action:'cancel'})).status,200);
    const crash=await store.create(record.users[0],[page],'smoke-crash-'+run);record.crash=crash.id;record.jobs.push(crash.id);await save();await store.claim(crash.id);await runtime.pool.query("UPDATE pagesignal_document_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[crash.id]);await deps.enqueue(crash.id,{idempotencyKey:'smoke-crash-'+run});
    const expired=await store.create(record.users[0],[page],'smoke-expiry-'+run);record.jobs.push(expired.id);await save();await runtime.pool.query("UPDATE pagesignal_document_jobs SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);
    assert.equal((await retention.fetch(new Request(runtime.origin+'/api/internal/job-retention'))).status,401);assert.equal((await retention.fetch(new Request(runtime.origin+'/api/internal/job-retention',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET}}))).status,204);assert.equal(await store.read(expired.id,record.users[0]),null);checks.push('authenticated_retention_deletes_expired_rows');
   }else{
    const job=await store.read(record.main,record.users[0]);assert.ok(job&&job.pages.every(p=>p.status==='complete'),'Real queue pages have not completed');checks.push('real_queue_two_page_completion');
    assert.equal((await api('GET',record.main,undefined,strangerCookie)).status,404);assert.equal((await api('POST',record.main,{action:'approve'},strangerCookie)).status,404);checks.push('real_session_owner_isolation');
    const crash=await store.read(record.crash,record.users[0]);assert.equal(crash.pages[0].error?.code,'interrupted_attempt_requires_review');assert.equal(crash.pages[0].attempts,1);checks.push('separate_worker_crash_requires_explicit_retry');
    assert.equal((await store.read(record.cancelled,record.users[0])).status,'cancelled');checks.push('queue_preserves_cancellation');
    const approval=await api('POST',record.main,{action:'approve'});assert.equal(approval.status,200);assert.equal((await approval.json()).status,'approved');checks.push('authenticated_approval');
    const usage=(await runtime.pool.query('SELECT SUM(requests)::int AS count FROM pagesignal_usage WHERE subject=$1',['account:'+record.users[0]])).rows[0].count;assert.equal(usage,2);checks.push('two_provider_attempts_charged_to_synthetic_owner');
    assert.equal((await api('DELETE',record.main)).status,200);assert.equal((await api('GET',record.main)).status,404);checks.push('authenticated_deletion');await cleanup();checks.push('synthetic_users_sessions_jobs_removed');
   }
  }
 }
 const report={schemaVersion:1,stage,verifiedAt:new Date().toISOString(),sourceRevision:process.env.VERCEL_GIT_COMMIT_SHA,checks,scope:'Real Neon SQL and signed BetterAuth sessions through the job handler; queue delivery crosses deployed worker instances. No browser OAuth flow was exercised. No user credentials or document values retained.'};
 await mkdir('web',{recursive:true});await writeFile('web/job-readiness.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({jobReadinessStage:stage,checks}));
}catch(error){console.error(JSON.stringify({jobReadinessStage:stage,failed:true,reason:error instanceof assert.AssertionError?error.message:'Integration check failed; inspect safe provider/job status.'}));if(stage==='seed')await cleanup().catch(()=>{});throw new Error('Job readiness verification did not pass');}
finally{await runtime.pool.end();}
