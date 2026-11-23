import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {trafficMetadata,recordTraffic,readTraffic,observeTraffic} from '../lib/api-traffic.mjs';
const env={VERCEL:'1',VERCEL_ENV:'production'};
const req=(headers={})=>new Request('https://www.pagesignal.studio/api/ai/extract?secret=private',{method:'POST',headers});
test('API location trusts only Vercel deployments and source reporting strips private URL parts',()=>{
 const request=req({'x-vercel-ip-country':'us','x-vercel-ip-country-region':'MO',origin:'https://example.com:8443/private?token=secret','x-forwarded-for':'192.0.2.1',cookie:'private'});
 assert.deepEqual(trafficMetadata(request,env),{country:'US',region:'MO',source_host:'example.com',source_kind:'reported_origin'});
 assert.equal(trafficMetadata(request,{}).country,'Unknown');
 assert.equal(trafficMetadata(req({'x-vercel-ip-country':'<script>','x-vercel-ip-country-region':'x'.repeat(100)}),env).region,'Unknown');
 assert.deepEqual(trafficMetadata(req({origin:'null',referer:'https://docs.example.org/a?email=private@example.com'}),env),{country:'Unknown',region:'Unknown',source_host:'docs.example.org',source_kind:'reported_referrer'});
 assert.equal(trafficMetadata(req({origin:'https://user:secret@example.com',referer:'file:///private'}),env).source_host,'Unknown');
});
test('real SQL aggregates distinct accounts, HTTP outcomes, environments and 30-date retention without request contents',async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE TABLE "user"(id text PRIMARY KEY); INSERT INTO "user" VALUES(\'one\'),(\'two\')');
  const event={request:req({origin:'https://www.pagesignal.studio','x-vercel-ip-country':'US','x-vercel-ip-country-region':'NY','x-forwarded-for':'192.0.2.1'}),env,userId:'one',endpoint:'/api/ai/extract',status:200,durationMs:10};
  await recordTraffic(db,event);await recordTraffic(db,event);await recordTraffic(db,{...event,userId:'two',status:502,durationMs:20});
  await recordTraffic(db,{...event,env:{...env,VERCEL_ENV:'preview'}});
  const report=await readTraffic(db,env);assert.equal(report.summary.requests,3);assert.equal(report.summary.active_accounts,2);assert.equal(report.summary.failed_requests,1);assert.equal(report.locations[0].requests,3);assert.equal(report.sources[0].accounts,2);assert.equal(report.endpoints.find(r=>r.status===200).average_ms,10);
  assert.equal((await readTraffic(db,{...env,VERCEL_ENV:'preview'})).summary.requests,1);
  await db.exec("UPDATE pagesignal_api_traffic SET day=current_date-30");assert.equal((await readTraffic(db,env)).summary.requests,0);
  await recordTraffic(db,event);const serialized=JSON.stringify((await db.query('SELECT * FROM pagesignal_api_traffic')).rows);assert.ok(!serialized.includes('192.0.2.1'));assert.ok(!serialized.includes('secret'));
  await db.exec('DELETE FROM "user" WHERE id=\'one\'');assert.equal((await readTraffic(db,env)).summary.requests,0);
 }finally{await db.close();}
});
test('observation records only explicitly authorized users and telemetry failure preserves API response',async()=>{
 let writes=0;const deps={getRuntime:()=>({pool:{}}),recordTraffic:async()=>{writes++;}};
 const response=await observeTraffic(req(),env,deps,'/api/ai/extract',async()=>new Response(null,{status:401}));assert.equal(response.status,401);assert.equal(writes,0);
 await observeTraffic(req(),env,deps,'/api/ai/jobs',async authorized=>{authorized('one');return new Response(null,{status:200});});assert.equal(writes,1);
 const warn=console.warn;console.warn=()=>{};try{const failed=await observeTraffic(req(),env,{...deps,recordTraffic:async()=>{throw Error('DB unavailable');}},'/api/ai/extract',async authorized=>{authorized('one');return new Response('original',{status:502});});assert.equal(failed.status,502);assert.equal(await failed.text(),'original');}finally{console.warn=warn;}
});
