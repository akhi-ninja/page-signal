import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createJobStore,sealJob,openJob} from '../lib/document-jobs.mjs';
import {documentJobs} from '../lib/job-api.mjs';
import {processDocumentJob} from '../lib/job-worker.mjs';
import {reconcileDocument} from '../packages/sdk/document.mjs';
import {createDocumentJobClient} from '../packages/sdk/jobs.mjs';
const secret='x'.repeat(40),pages=[{page:1,image:'data:image/jpeg;base64,AA==',text:'ID: DEMO-1'}];
const result=()=>({document_type:'invoice',form_number:null,classification_status:'identified',page_role:'standalone',fields:[{label:'ID',section:null,value:'DEMO-1',state:'filled',evidence:'ID: DEMO-1'}],tables:[],review_notes:[]});
async function database(){const db=new PGlite();const query=async(s,args)=>{const r=args===undefined&&s.includes(';')?(await db.exec(s)).at(-1):await db.query(s,args);return {...r,rowCount:r.affectedRows};};const pool={query,connect:async()=>({query,release(){}})};const store=createJobStore(pool,secret);await store.migrate();return {db,pool,store};}
test('encrypted states bind ciphertext to job ID and reject wrong secret/tampering',()=>{
 const token=sealJob({sensitive:'not plaintext'},secret,'job-a');assert.ok(!token.includes('plaintext'));assert.deepEqual(openJob(token,secret,'job-a'),{sensitive:'not plaintext'});assert.throws(()=>openJob(token,secret,'job-b'));assert.throws(()=>openJob(token,'wrong','job-a'));
});
test('actual Postgres job SQL persists across store instances, scopes owners, leases, reviews and deletes',async()=>{
 const {db,pool,store}=await database();try{
  const created=await store.create('alice',pages,'test-key-123');assert.equal((await store.create('alice',pages,'test-key-123')).created,false);await assert.rejects(store.create('alice',[{...pages[0],text:'changed'}],'test-key-123'));
  assert.equal(await store.read(created.id,'bob'),null);assert.equal(await store.delete(created.id,'bob'),0);
  const claim=await store.claim(created.id);assert.equal(claim.kind,'claimed');assert.equal((await store.claim(created.id)).kind,'busy');
  const fresh=createJobStore(pool,secret);await fresh.finish(claim,{status:'complete',result:result()});const job=await fresh.read(created.id,'alice');assert.equal(job.status,'needs_review');assert.ok(!JSON.stringify(job).includes('data:image'));
  const approved=await fresh.action(created.id,'alice','approve');assert.equal(approved.status,'approved');assert.equal(approved.approved_result.status,'approved');
  await fresh.delete(created.id,'alice');assert.equal(await fresh.read(created.id,'alice'),null);
 }finally{await db.close();}
});
test('crashed worker needs explicit review/retry, cancellation rejects late completions, expiry is deleted',async()=>{
 const {db,pool,store}=await database();try{
  const {id}=await store.create('alice',pages,'test-crash-key');const first=await store.claim(id);await pool.query("UPDATE pagesignal_document_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[id]);assert.equal((await store.claim(id)).kind,'terminal');assert.equal((await store.read(id,'alice')).pages[0].error.code,'interrupted_attempt_requires_review');
  await store.action(id,'alice','retry');const second=await store.claim(id);assert.equal(second.page.attempts,2);await store.finish(first,{status:'complete',result:result()});assert.equal((await store.read(id,'alice')).pages[0].status,'processing');
  await store.action(id,'alice','cancel');await store.finish(second,{status:'complete',result:result()});assert.equal((await store.read(id,'alice')).status,'cancelled');await assert.rejects(store.action(id,'alice','approve'));
  await pool.query("UPDATE pagesignal_document_jobs SET expires_at=now()-interval '1 second' WHERE id=$1",[id]);assert.equal(await store.read(id,'alice'),null);assert.equal(await store.prune(),1);
 }finally{await db.close();}
});
test('job API enforces session, verified owner, origins and streamed limits before writes',async()=>{
 const env={PAGESIGNAL_DURABLE_JOBS:'true',CRON_SECRET:secret,BETTER_AUTH_SECRET:secret};let user=null,writes=0;const runtime={origin:'https://example.test',auth:{api:{getSession:async()=>user?{user}:null}}};const deps={getRuntime:()=>runtime,store:{create:async()=>{writes++;},prune:async()=>{}},enqueue:async()=>{}};
 const request=(body={},origin='https://example.test')=>new Request('https://example.test/api/ai/jobs',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await documentJobs(request(),env,deps)).status,401);user={id:'alice',emailVerified:false};assert.equal((await documentJobs(request(),env,deps)).status,403);user.emailVerified=true;assert.equal((await documentJobs(request({},'https://evil.test'),env,deps)).status,403);
 assert.equal((await documentJobs(request({pages,idempotency_key:'key-valid',padding:'x'.repeat(4000000)}),env,deps)).status,413);assert.equal(writes,0);
});
test('worker uses stored owner quota, sanitizes provider errors and bounds automatic retries',async()=>{
 const {db,store,pool}=await database();try{
  const {id}=await store.create('alice',pages,'worker-test-key');let calls=0,reservations=0,sends=0;
  const deps={getRuntime:()=>({origin:'https://example.test',pool}),store,ownerVerified:async owner=>owner==='alice',reserve:async(_pool,owner)=>{assert.equal(owner,'alice');reservations++;return {allowed:true};},extract:async()=>{calls++;return Response.json({code:'provider_rate_limit',retry_after_seconds:1,error:'secret provider body'},{status:502});},enqueue:async()=>{sends++;}};
  await processDocumentJob({jobId:id},{PAGESIGNAL_DURABLE_JOBS:'true'},deps);assert.equal((await store.read(id,'alice')).pages[0].status,'queued');assert.equal(sends,1);
  await processDocumentJob({jobId:id},{PAGESIGNAL_DURABLE_JOBS:'true'},deps);assert.equal((await store.read(id,'alice')).pages[0].status,'failed');assert.equal(calls,2);assert.equal(reservations,2);assert.ok(!JSON.stringify(await store.read(id,'alice')).includes('secret'));
  await processDocumentJob({jobId:id},{PAGESIGNAL_DURABLE_JOBS:'true'},deps);assert.equal(calls,2);
 }finally{await db.close();}
});
test('document grouping preserves boundaries, repeated fields, conflicts, failed pages and incomplete tables',()=>{
 const a=result();a.page_role='first';a.document_type='contract';a.fields[0].label='Customer';a.tables=[{title:null,columns:['Item','Total'],rows:[['A','1']]}];
 const b=structuredClone(a);b.page_role='continuation';b.fields[0].value='Other';b.tables[0].rows=[[null,'2']];
 const c=structuredClone(a);c.page_role='first';
 const output=reconcileDocument([{page:1,result:a},{page:2,result:b},{page:3,error:{code:'page_failed'}},{page:4,result:c}]);assert.equal(output.documents.length,3);assert.equal(output.documents[0].conflicts.length,1);assert.equal(output.documents[0].table_continuations[0].reason,'incomplete_rows_not_joined');assert.notEqual(output.documents[0].fields[0].id,output.documents[0].fields[1].id);assert.equal(output.pages[1].result.tables[0].rows[0][0],null);
});
test('browser job client uses same-origin cookies and refuses external endpoints',async()=>{
 assert.throws(()=>createDocumentJobClient({endpoint:'//evil.test'}));let called;const client=createDocumentJobClient({fetch:async(url,init)=>{called={url,init};return Response.json({id:'job'});}});await client.create(pages,'browser-key');assert.equal(called.init.credentials,'same-origin');assert.equal(called.url,'/api/ai/jobs');assert.ok(!called.init.headers.Authorization);
});
test('authenticated job submission, real quota SQL, poll, approval and deletion stay under one owner',async()=>{
 const {db,pool,store}=await database();try{
  const {usageSchema}=await import('../lib/usage.mjs');await pool.query(usageSchema);let owner='alice';const queued=[];
  const runtime={origin:'https://example.test',pool,auth:{api:{getSession:async()=>({user:{id:owner,emailVerified:true}})}}};const env={PAGESIGNAL_DURABLE_JOBS:'true',CRON_SECRET:secret,BETTER_AUTH_SECRET:secret};const dependencies={getRuntime:()=>runtime,store,enqueue:async id=>queued.push(id)};
  const req=(method,id,body)=>new Request(runtime.origin+'/api/ai/jobs'+(id?'?id='+id:''),{method,headers:{Origin:runtime.origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const response=await documentJobs(req('POST',null,{pages,idempotency_key:'end-to-end-test',owner_id:'bob'}),env,dependencies);assert.equal(response.status,202);const {id}=await response.json();assert.equal(queued[0],id);
  await processDocumentJob({jobId:id},env,{...dependencies,ownerVerified:async()=>true,extract:async()=>Response.json(result())});
  assert.equal((await pool.query("SELECT requests FROM pagesignal_usage WHERE subject='account:alice'")).rows[0].requests,1);assert.equal((await pool.query("SELECT requests FROM pagesignal_usage WHERE subject='account:bob'")).rows.length,0);
  assert.equal((await (await documentJobs(req('GET',id),env,dependencies)).json()).status,'needs_review');
  owner='bob';assert.equal((await documentJobs(req('GET',id),env,dependencies)).status,404);assert.equal((await documentJobs(req('POST',id,{action:'approve'}),env,dependencies)).status,404);owner='alice';assert.equal((await documentJobs(req('POST',id,{action:'approve'}),env,dependencies)).status,200);assert.equal((await documentJobs(req('DELETE',id),env,dependencies)).status,200);
 }finally{await db.close();}
});

test('quota denial preserves paid-attempt budget for an explicit later retry',async()=>{
 const {db,pool,store}=await database();try{
  const {id}=await store.create('alice',pages,'quota-denial-key');let calls=0;
  await processDocumentJob({jobId:id},{PAGESIGNAL_DURABLE_JOBS:'true'},{getRuntime:()=>({origin:'https://example.test',pool}),store,ownerVerified:async()=>true,reserve:async()=>({allowed:false}),extract:async()=>{calls++;},enqueue:async()=>{}});
  const status=await store.read(id,'alice');assert.equal(calls,0);assert.equal(status.pages[0].attempts,0);assert.equal(status.pages[0].error.code,'usage_limit');
  await store.action(id,'alice','retry');assert.equal((await store.claim(id)).page.attempts,1);
 }finally{await db.close();}
});

test('manual approval keeps original values separately from reviewed corrections',async()=>{
 const {db,store}=await database();try{
  const {id}=await store.create('alice',pages,'manual-review-key');await store.finish(await store.claim(id),{status:'complete',result:result()});
  const corrected=result();corrected.fields[0].value='DEMO-2';corrected.fields.push({section:null,label:'Added during review',value:'manual',state:'filled',evidence:null});
  const approved=await store.action(id,'alice','approve',[{page:1,result:corrected}]);
  assert.equal(approved.result.pages[0].result.fields[0].value,'DEMO-1');const fields=approved.approved_result.documents[0].fields;assert.equal(fields[0].value,'DEMO-2');assert.equal(fields[0].original_value,'DEMO-1');assert.equal(fields[0].review_state,'manually_reviewed');assert.equal(fields[1].original_value,null);
 }finally{await db.close();}
});
test('malformed provider success fails explicitly without repeating the paid call or holding a stale lease',async()=>{
 const {db,pool,store}=await database();try{const {id}=await store.create('alice',pages,'malformed-page-key');let calls=0;await processDocumentJob({jobId:id},{PAGESIGNAL_DURABLE_JOBS:'true'},{getRuntime:()=>({origin:'https://example.test',pool}),store,ownerVerified:async()=>true,reserve:async()=>({allowed:true}),extract:async()=>{calls++;return Response.json({bad:'shape'});},enqueue:async()=>{throw Error('Must not automatically repeat');}});const status=await store.read(id,'alice');assert.equal(calls,1);assert.equal(status.pages[0].status,'failed');assert.equal(status.pages[0].error.code,'provider_malformed_output');assert.equal(status.pages[0].attempts,1);}finally{await db.close();}
});
test('environment scopes isolate identical owners/keys, worker claims, cleanup and encryption AAD',async()=>{
 const {db,pool}=await database();try{const production=createJobStore(pool,secret,{scope:'production'}),preview=createJobStore(pool,secret,{scope:'preview:development'});const a=await production.create('alice',pages,'same-key-scoped'),b=await preview.create('alice',pages,'same-key-scoped');assert.notEqual(a.id,b.id);assert.equal(await preview.read(a.id,'alice'),null);assert.equal(await preview.action(a.id,'alice','cancel'),null);assert.equal(await preview.claim(a.id),null);assert.equal(await preview.delete(a.id,'alice'),0);
 await pool.query("UPDATE pagesignal_document_jobs SET job_scope='production',idempotency_key='tampered-scope-key' WHERE id=$1",[b.id]);await assert.rejects(production.read(b.id,'alice'));await pool.query("UPDATE pagesignal_document_jobs SET job_scope='preview:development',expires_at=now()-interval '1 second' WHERE id=$1",[b.id]);assert.equal(await production.prune(),0);assert.equal(await preview.prune(),1);assert.ok(await production.read(a.id,'alice'));
 const {jobScope}=await import('../lib/document-jobs.mjs');assert.equal(jobScope({VERCEL:'1',VERCEL_ENV:'production'}),'production');assert.ok(jobScope({VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'development'}).startsWith('preview:'));assert.throws(()=>jobScope({VERCEL:'1',VERCEL_ENV:'preview'}));
 }finally{await db.close();}
});
test('environment migration refuses active unscoped jobs instead of silently making them inaccessible',async()=>{
 const {db,pool,store}=await database();try{await pool.query("INSERT INTO pagesignal_document_jobs(id,owner_id,idempotency_key,input_hash,status,encrypted_state,expires_at,job_scope) VALUES('legacy','alice','legacy-key','hash','queued','ciphertext',now()+interval '1 hour','legacy')");await assert.rejects(store.migrate(),/Export and remove/);await pool.query("UPDATE pagesignal_document_jobs SET expires_at=now()-interval '1 second' WHERE id='legacy'");await store.migrate();assert.equal(await store.prune(),1);}finally{await db.close();}
});
