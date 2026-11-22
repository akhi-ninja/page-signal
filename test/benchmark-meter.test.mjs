import test from 'node:test';
import assert from 'node:assert/strict';
import {providerMeter} from '../benchmark/provider-metrics.mjs';
const url='https://api.openai.com/v1/responses';
test('provider metering measures cache-aware token costs without keeping model text or credentials',async()=>{
 const meter=providerMeter(async()=>Response.json({model:'gpt-4.1-mini-2025-04-14',service_tier:'default',usage:{input_tokens:1000,input_tokens_details:{cached_tokens:400},output_tokens:200},output:[{secret:'DO NOT STORE'}]}),{model:'gpt-4.1-mini',maxCostUsd:.5});
 await meter.fetch(url,{headers:{Authorization:'secret'}});const report=meter.summary();
 assert.equal(report.tokenUsage.inputTokens,1000);assert.ok(Math.abs(report.estimatedCostUsd-.0006)<1e-12);assert.ok(!JSON.stringify(report).includes('DO NOT STORE'));assert.ok(!JSON.stringify(report).includes('Authorization'));
});
test('unknown usage is not reported as zero cost and consumes conservative budget',async()=>{
 let calls=0;const meter=providerMeter(async()=>{calls++;return Response.json({error:'unavailable'},{status:502});},{model:'gpt-4.1-mini',maxCostUsd:.5});
 await meter.fetch(url);assert.equal(meter.summary().estimatedCostUsd,null);await assert.rejects(meter.fetch(url),/budget reached/);assert.equal(calls,1);
});
test('unsupported model budget, wrong endpoint and insufficient budget fail before calling provider',async()=>{
 assert.throws(()=>providerMeter(()=>{},{model:'unknown',maxCostUsd:1}),/supported/);
 let calls=0;const meter=providerMeter(()=>{calls++;},{model:'gpt-4.1-mini',maxCostUsd:.1});
 await assert.rejects(meter.fetch('https://wrong.test'),/endpoint/);await assert.rejects(meter.fetch(url),/budget reached/);assert.equal(calls,0);
});
test('optional build never runs a paid benchmark in production or on a feature branch',async()=>{
 const {spawnSync}=await import('node:child_process');
 for(const [environment,branch] of [['production','development'],['preview','feature/test'],['preview','development']]){
  const env={PATH:process.env.PATH,VERCEL_ENV:environment,VERCEL_GIT_COMMIT_REF:branch};if(branch!=='development'||environment==='production')env.PAGESIGNAL_RUN_BENCHMARK='nine-page-v2';
  const r=spawnSync(process.execPath,['scripts/optional-benchmark-build.mjs'],{env,encoding:'utf8'});assert.equal(r.status,0);assert.match(r.stdout,/benchmark is disabled/);
 }
});
