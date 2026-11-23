import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {fixtureInput} from '../benchmark/pdf-input.mjs';
import {verifyFields} from '../web/document-quality.mjs';
import { providerMeter } from '../benchmark/provider-metrics.mjs';
import { scoreSuite,validatePrediction } from '../benchmark/scorer.mjs';
import { extractPage } from '../packages/core/index.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = name => { const index=args.indexOf(name); return index<0 ? undefined : args[index+1]; };
const flags=new Set(['--live','--help']);
const valued=new Set(['--predictions','--out','--max-pages','--max-cost-usd','--engine']);
for(let i=0;i<args.length;i++){
 if(flags.has(args[i])) continue;
 if(!valued.has(args[i])||!args[i+1]||args[i+1].startsWith('--')) throw new Error('Unknown option or missing option value: '+args[i]);
 i++;
}
const engine=option('--engine')||'pipeline';
if(!['pipeline','langgraph'].includes(engine))throw new Error('Engine must be pipeline or langgraph.');
const live=args.includes('--live');
if(live&&option('--predictions')) throw new Error('Choose either live execution or offline predictions, not both.');
if (args.includes('--help')) {
 console.log('Offline: npm run benchmark -- --predictions PATH --out PATH\nLive (paid): npm run benchmark -- --live --max-pages 9 --engine langgraph --max-cost-usd 0.50 --out PATH');
 process.exit(0);
}
const manifestBytes=await readFile(resolve(root,'benchmark/fixtures/manifest.json'));
const manifestSha256=createHash('sha256').update(manifestBytes).digest('hex');
const manifest=JSON.parse(manifestBytes);
const inputHash=createHash('sha256').update(manifestBytes);
for(const fixture of manifest.fixtures){inputHash.update(await readFile(resolve(root,'benchmark/fixtures',fixture.image)));if(fixture.sourcePdf)inputHash.update(await readFile(resolve(root,'benchmark/fixtures',fixture.sourcePdf)));}
const fixtureInputsSha256=inputHash.digest('hex');
const predictions={}; const executions=[];let meter;const renderedHash=createHash('sha256');
const model=process.env.OPENAI_DOCUMENT_MODEL || 'gpt-4.1-mini';
if (live) {
 const maxPages=Number(option('--max-pages'));
 if (!Number.isInteger(maxPages)||maxPages<1||maxPages>manifest.fixtures.length) throw new Error('Live runs require --max-pages between 1 and fixture count.');
 if (!process.env.OPENAI_API_KEY) throw new Error('Set OPENAI_API_KEY server-side before a live run.');
 meter=providerMeter(globalThis.fetch.bind(globalThis),{model,maxCostUsd:option('--max-cost-usd')===undefined?undefined:Number(option('--max-cost-usd'))});
 globalThis.fetch=meter.fetch;
 for (const fixture of manifest.fixtures.slice(0,maxPages)) {
  if(meter.calls.some(c=>[401,403,429].includes(c.httpStatus))){executions.push({id:fixture.id,status:'not_attempted_provider_unavailable',latencyMs:null});continue;}
  const start=performance.now();
  try {
   const prepared=await fixtureInput(fixture,resolve(root,'benchmark/fixtures'));const page={image:prepared.image,text:prepared.text};renderedHash.update(fixture.id).update(page.image).update(page.text);
   const call=page=>extractPage(page,{apiKey:process.env.OPENAI_API_KEY,model});
   if(engine==='langgraph'){
    const {createPageWorkflow}=await import('../lib/document-workflow.mjs');
    const state=await createPageWorkflow({page,extractPage:call,maxCalls:1}).start({recursionLimit:16});
    predictions[fixture.id]=state.result;
   }else predictions[fixture.id]=await call(page);
   validatePrediction(predictions[fixture.id]);
   executions.push({id:fixture.id,status:'completed',latencyMs:Math.round(performance.now()-start),textMode:prepared.textMode,reviewFieldCount:verifyFields(predictions[fixture.id],page.text).filter(f=>['needs_review','illegible'].includes(f.verification.status)).length});
  } catch (error) { delete predictions[fixture.id];executions.push({id:fixture.id,status:'failed',httpStatus:Number.isInteger(error.status)?error.status:null,latencyMs:Math.round(performance.now()-start)}); }
 }
} else {
 if (!option('--predictions')) throw new Error('Supply --predictions PATH for offline scoring, or explicit --live --max-pages N.');
 const supplied=JSON.parse(await readFile(resolve(option('--predictions')),'utf8'));
 if (!supplied || typeof supplied!=='object' || Array.isArray(supplied)) throw new Error('Predictions must be an object keyed by fixture ID.');
 Object.assign(predictions,supplied);
}
let sourceRevision=process.env.BENCHMARK_REVISION||process.env.VERCEL_GIT_COMMIT_SHA||null;
if (!sourceRevision) { try { sourceRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(); } catch {} }
const promptSchemaSha256=createHash('sha256').update(await readFile(resolve(root,'packages/core/extraction.mjs'))).digest('hex');
const selected=live?{...manifest,fixtures:manifest.fixtures.slice(0,Number(option('--max-pages')))}:manifest;
const latency=executions.filter(r=>r.status==='completed').map(r=>r.latencyMs).sort((a,b)=>a-b);
const percentile=p=>latency.length?latency[Math.max(0,Math.ceil(latency.length*p)-1)]:null;
const report={...scoreSuite(selected,predictions), run:{kind:live?'live-model':'offline-predictions',engine:live?engine:null,model:live?model:null,manifestVersion:manifest.version,manifestSha256,fixtureInputsSha256,renderedInputsSha256:live?renderedHash.digest('hex'):null,reviewEffort:{kind:'automated_review_field_proxy',fields:live?executions.reduce((n,e)=>n+(e.reviewFieldCount||0),0):null,humanMinutes:null},createdAt:new Date().toISOString(),promptAndSchemaSource:'packages/core/extraction.mjs',sourceRevision,promptSchemaSha256,providerMetrics:meter?.summary()??null,tokenUsage:meter?.summary().tokenUsage??null,costUsd:meter?.summary().estimatedCostUsd??null,costNote:meter?.summary().costNote??'Offline predictions: usage and cost are not measured.',executionEnvironment:process.env.VERCEL?'vercel-build':'local',p50LatencyMs:percentile(.5),p95LatencyMs:percentile(.95),executions}};
const out=resolve(option('--out') || 'benchmark/reports/local-report.json');
await mkdir(dirname(out),{recursive:true}); await writeFile(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({report:out,kind:report.run.kind,samples:report.sampleCount,metrics:report.groups.all.metrics},null,2));
// Raw model output deliberately stays in memory; reports contain metrics, not extracted values.
