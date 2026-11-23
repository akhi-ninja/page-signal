import {boundedRetryDelay} from '../packages/core/retry-policy.mjs';
import {getAuthRuntime,requestLimits} from './auth.mjs';
import {reserveAiRequest} from './usage.mjs';
import {orchestratedExtract} from './orchestrated-extraction.mjs';
import {createJobStore} from './document-jobs.mjs';
export async function processDocumentJob(message,env=process.env,dependencies={}){
 if(env.PAGESIGNAL_DURABLE_JOBS!=='true')return;
 if(!message||typeof message.jobId!=='string'||!/^[a-f0-9-]{36}$/i.test(message.jobId))return;
 const runtime=(dependencies.getRuntime||getAuthRuntime)(env);if(!runtime)throw Error('Job runtime unavailable');
 const store=dependencies.store||createJobStore(runtime.pool,env.BETTER_AUTH_SECRET);await store.prune();
 const claim=await store.claim(message.jobId);if(!claim||claim.kind==='terminal')return;
 if(claim.kind==='busy')throw Error('Job lease is active');
 let outcome,delay=0,usage=null,providerStarted=false;const started=performance.now();
 try{
  const owner=dependencies.ownerVerified?await dependencies.ownerVerified(claim.owner):(await runtime.pool.query('SELECT "emailVerified" FROM "user" WHERE id=$1',[claim.owner])).rows[0]?.emailVerified;
  if(!owner)outcome={status:'failed',error:{code:'verified_owner_required'}};
  else{
   const latest=await store.read(claim.jobId,claim.owner);if(!latest||latest.status==='cancelled')return;
   const reservation=await (dependencies.reserve||reserveAiRequest)(runtime.pool,claim.owner,requestLimits(env));
   if(!reservation.allowed)outcome={status:'failed',error:{code:'usage_limit'}};
   else{
    providerStarted=true;const response=await (dependencies.extract||orchestratedExtract)(new Request(runtime.origin+'/api/ai/extract',{method:'POST',headers:{Origin:runtime.origin,'Content-Type':'application/json'},body:JSON.stringify(claim.page.input),signal:AbortSignal.timeout(105000)}),{...env,PAGESIGNAL_ORCHESTRATOR:'langgraph',PAGESIGNAL_GRAPH_RECHECK:'false'});
    usage=Object.fromEntries(['Input-Tokens','Output-Tokens','Cached-Tokens','Estimated-Cost-Usd'].map(key=>{const v=response.headers.get('X-PageSignal-'+key);return [key,v!==null&&Number.isFinite(Number(v))?Number(v):null];}));
    const data=await response.json();
    if(response.ok)outcome={status:'complete',result:data,error:null};
    else{const code=['provider_timeout','provider_cancelled','provider_malformed_output','provider_network_error','provider_rate_limit','provider_authentication','provider_unavailable','provider_invalid_request'].includes(data.code)?data.code:'extraction_failed';
     // Only an explicit provider rejection is automatically retried; timeouts are ambiguous paid attempts.
     const retry=code==='provider_rate_limit'&&claim.page.attempts<2;
     outcome={status:retry?'queued':'failed',error:{code,retryable:retry}};delay=retry?boundedRetryDelay({attempt:claim.page.attempts,retryAfter:data.retry_after_seconds}):0;
    }
   }
  }
 }catch{outcome={status:'failed',error:{code:'interrupted_attempt_requires_review'}};}
 outcome.no_provider=!providerStarted;outcome.metrics={provider_started:providerStarted,duration_ms:Math.round(performance.now()-started),attempt:claim.page.attempts,usage};
 const done=await store.finish(claim,outcome);
 if(done?.more)await dependencies.enqueue(claim.jobId,{delaySeconds:delay,idempotencyKey:`${claim.jobId}:${claim.page.page}:${claim.page.attempts}`});
}
