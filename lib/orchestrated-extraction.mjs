import {targetedExtract} from './crop-extraction.mjs';
import { verifyFields } from '../web/document-quality.mjs';
import { prepareTargetedRecheck } from './targeted-recheck.mjs';
import { extract } from './extraction.mjs';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
/** Auth/quota must be enforced by the caller. Existing request/response shape is preserved. */
export async function orchestratedExtract(request,env,dependencies={}) {
 if(env.PAGESIGNAL_ORCHESTRATOR!=='langgraph')return extract(request,env);
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Invalid request origin or content type.'},403);
 if(!env.OPENAI_API_KEY)return json({error:'AI extraction is not configured.'},503);
 if(Number(request.headers.get('content-length'))>4000000)return json({error:'Page image is too large.'},413);
 let body;try{
  const reader=request.clone().body?.getReader();let bytes=0;const chunks=[];
  if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4000000){await reader.cancel();return json({error:'Page image is too large.'},413);}chunks.push(value);}}finally{reader.releaseLock();}
  body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }catch{return json({error:'Invalid JSON body.'},400);}
 if(!body||typeof body!=='object')return json({error:'Invalid request body.'},400);
 // Follow-up questions retain the existing evidence-grounded query implementation.
 if(body.operation==='document_query')return extract(request,env);
 if(([env.LANGCHAIN_TRACING_V2,env.LANGSMITH_TRACING].some(v=>/^(true|1)$/i.test(v||'')))&&env.PAGESIGNAL_ALLOW_EXTERNAL_TRACING!=='true') return json({error:'External tracing must be explicitly authorized for document workflows.'},503);
 const {createPageWorkflow}=await import('./document-workflow.mjs');
 const controller=AbortSignal.any([request.signal,AbortSignal.timeout(105000)]);
 const usage=[];
 let extractMs=0;
 const implementation=dependencies.extractPage|| (async page=>{
  const response=page.field_target?await targetedExtract(page,env,controller):await extract(new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(page),signal:controller}),{...env,PAGESIGNAL_PROVIDER_TIMEOUT_MS:45000});
  if(!response.ok){const error=new Error('Workflow extraction failed.');error.status=response.status;const safe=await response.json().catch(()=>({}));if(['provider_timeout','provider_cancelled','provider_malformed_output','provider_network_error','provider_rate_limit','provider_authentication','provider_unavailable','provider_invalid_request'].includes(safe.code)){error.code=safe.code;error.retryable=safe.retryable;error.retryAfter=safe.retry_after_seconds;}throw error;}
  usage.push(Object.fromEntries(['Input-Tokens','Output-Tokens','Cached-Tokens','Estimated-Cost-Usd'].map(key=>[key,response.headers.get('X-PageSignal-'+key)])));
  return response.json();
 });
 const call=async page=>{const started=performance.now();try{return await implementation(page);}finally{extractMs+=performance.now()-started;}};
 try {
  const workflow=createPageWorkflow({page:body,extractPage:call,prepareRecheck:env.PAGESIGNAL_GRAPH_TARGETED_RECHECK==='true'?prepareTargetedRecheck:undefined,maxCalls:env.PAGESIGNAL_GRAPH_RECHECK==='true'?2:1,reserveAdditional:dependencies.reserveAdditional||(async()=>false)});
  const workflowStarted=performance.now();
  const state=await workflow.start({signal:controller,recursionLimit:16});
  if(!state.result||typeof state.result!=='object'||!Array.isArray(state.result.fields)||!Array.isArray(state.result.tables)||state.issues.some(i=>['invalid_result_shape','invalid_field_shape','invalid_table_shape','invalid_classification_status'].includes(i)))return json({error:'AI returned an invalid document result.',code:'provider_malformed_output',retryable:false},502);
  const workflowMs=performance.now()-workflowStarted,validationStarted=performance.now();
  const result=structuredClone(state.result);
  result.fields=verifyFields(result,body.text);
  if(result.vision_recheck?.length)result.review_notes.push('A cropped vision proposal is available in JSON. Review it against the original; existing values were not overwritten.');
  if(state.issues.length){result.classification_status='needs_review';result.review_notes=[...(Array.isArray(result.review_notes)?result.review_notes:[]),'Workflow validation requires review: '+state.issues.join(', ')];}
  const fieldValidationMs=performance.now()-validationStarted;
  const response=json(result);
  response.headers.set('X-PageSignal-Stage-Ms',JSON.stringify({workflow_ms:Math.round(workflowMs),extract_ms:Math.round(extractMs),field_validation_ms:Math.round(fieldValidationMs)}));
  for(const key of ['Input-Tokens','Output-Tokens','Cached-Tokens','Estimated-Cost-Usd'])if(usage.length===state.attempts&&usage.every(u=>u[key]!==null&&Number.isFinite(Number(u[key]))))response.headers.set('X-PageSignal-'+key,String(usage.reduce((n,u)=>n+Number(u[key]),0)));
  response.headers.set('X-PageSignal-Orchestrator','langgraph-v1');
  response.headers.set('X-PageSignal-Model-Calls',String(state.attempts));
  response.headers.set('X-PageSignal-Review-Required',String(Boolean(state.issues.length)));
  return response;
 }catch(error){const response=json({...(error.code?{code:error.code,retryable:error.retryable,retry_after_seconds:error.retryAfter}:{}),error:controller.aborted?'Document workflow timed out or was cancelled.':'Document workflow could not complete. Please retry or use the standard extraction pipeline.'},[400,413,429,503].includes(error.status)?error.status:502);if(Number.isFinite(error.retryAfter)&&error.retryAfter>0)response.headers.set('Retry-After',String(Math.min(300,Math.ceil(error.retryAfter))));return response;}
}
