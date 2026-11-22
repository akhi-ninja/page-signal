import test from 'node:test';
import assert from 'node:assert/strict';
import { MemorySaver } from '@langchain/langgraph';
import { createPageWorkflow, workflowConfig } from '../lib/document-workflow.mjs';
import { orchestratedExtract } from '../lib/orchestrated-extraction.mjs';
import { accountExtract } from '../lib/account-api.mjs';
const page={image:'data:image/jpeg;base64,AA==',text:'Invoice DEMO-1'};
const result=()=>({document_type:'invoice',form_number:'DEMO-1',classification_status:'identified',fields:[{section:null,label:'Invoice number',value:'DEMO-1',state:'filled',evidence:'Invoice DEMO-1'}],tables:[],review_notes:[]});
const request=body=>new Request('https://example.test/api/ai/extract',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json'},body:JSON.stringify(body??page)});
test('real LangGraph executes a clean page once and preserves the result',async()=>{
 let calls=0;const workflow=createPageWorkflow({page,extractPage:async()=>{calls++;return result();}});
 const state=await workflow.start();assert.equal(state.status,'completed');assert.equal(calls,1);assert.deepEqual(state.result,result());
});
test('recheck is bounded to one extra call and can fix review findings',async()=>{
 let calls=0,reservations=0;const workflow=createPageWorkflow({page,maxCalls:2,reserveAdditional:async()=>{reservations++;return true;},extractPage:async()=>({...result(),classification_status:++calls===1?'needs_review':'identified'})});
 const state=await workflow.start();assert.equal(calls,2);assert.equal(reservations,1);assert.equal(state.status,'completed');
});
test('denied recheck budget returns original result for review without another model call',async()=>{
 let calls=0;const workflow=createPageWorkflow({page,maxCalls:2,reserveAdditional:async()=>false,extractPage:async()=>{calls++;return {...result(),classification_status:'unidentified'};}});
 const state=await workflow.start();assert.equal(calls,1);assert.equal(state.status,'needs_review');assert.equal(state.recheckSkipped,true);
});
test('human review resumes from a shared checkpoint in a newly constructed graph without repeating extraction',async()=>{
 const checkpointer=new MemorySaver();let calls=0;
 const config=workflowConfig({tenantId:'alice',documentId:'doc1'});
 const workflow=createPageWorkflow({page,checkpointer,requireApproval:true,extractPage:async()=>{calls++;return result();}});
 const paused=await workflow.start(config);assert.ok(paused.__interrupt__?.length);assert.equal(calls,1);
 const resumed=createPageWorkflow({checkpointer,requireApproval:true,extractPage:async()=>{throw new Error('must not extract again');}});
 const edited=result();edited.fields[0].value='DEMO-2';
 const state=await resumed.resume({approved:true,result:edited},config);assert.equal(state.status,'completed');assert.equal(state.result.fields[0].value,'DEMO-2');
 assert.notEqual(config.configurable.thread_id,workflowConfig({tenantId:'bob',documentId:'doc1'}).configurable.thread_id);
 const snapshot=await workflow.graph.getState(config);assert.ok(!JSON.stringify(snapshot.values).includes('data:image'));
});
test('human rejection produces no export result; invalid approval fails',async()=>{
 const checkpointer=new MemorySaver();const config=workflowConfig({tenantId:'a',documentId:'r'});
 const flow=createPageWorkflow({page,checkpointer,requireApproval:true,extractPage:async()=>result()});
 await flow.start(config);const state=await flow.resume({approved:false},config);assert.equal(state.status,'rejected');assert.equal(state.result,null);
 assert.throws(()=>createPageWorkflow({page,requireApproval:true,extractPage:async()=>result()}),/checkpointer/);
});
test('feature flag returns compatible JSON and headers, malformed model output becomes an error',async()=>{
 const env={OPENAI_API_KEY:'test',PAGESIGNAL_ORCHESTRATOR:'langgraph'};
 const r=await orchestratedExtract(request(),env,{extractPage:async()=>result()});assert.equal(r.status,200);const data=await r.json();assert.equal(data.fields[0].verification.status,'transcript_match');delete data.fields[0].verification;assert.deepEqual(data,result());assert.equal(r.headers.get('x-pagesignal-orchestrator'),'langgraph-v1');
 const bad=await orchestratedExtract(request(),env,{extractPage:async()=>null});assert.equal(bad.status,502);
 const tracing=await orchestratedExtract(request(),{...env,LANGSMITH_TRACING:'true'},{extractPage:()=>{throw new Error('must not call');}});assert.equal(tracing.status,503);
});
test('account auth and both model attempts each enforce usage reservation',async()=>{
 const runtime={origin:'https://example.test',pool:{},auth:{api:{getSession:async()=>({user:{id:'alice',emailVerified:true}})}}};
 let reserved=0,calls=0;const original=globalThis.fetch;
 globalThis.fetch=async()=>{calls++;return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({...result(),classification_status:calls===1?'needs_review':'identified'})}]}]});};
 try{
  const r=await accountExtract(request(),{OPENAI_API_KEY:'test',PAGESIGNAL_ORCHESTRATOR:'langgraph',PAGESIGNAL_GRAPH_RECHECK:'true'},{getRuntime:()=>runtime,reserve:async(pool,id)=>{assert.equal(id,'alice');return {allowed:true,remaining:10-++reserved};}});
  assert.equal(r.status,200);assert.equal(calls,2);assert.equal(reserved,2);assert.equal(r.headers.get('x-pagesignal-requests-remaining'),'8');
 }finally{globalThis.fetch=original;}
});
test('cancelled graph cannot start a provider call and invalid pages fail before extraction',async()=>{
 let calls=0;const controller=new AbortController();controller.abort();
 const flow=createPageWorkflow({page,extractPage:async()=>{calls++;return result();}});
 await assert.rejects(flow.start({signal:controller.signal}));assert.equal(calls,0);
 const bad=createPageWorkflow({page:{image:'not a jpeg',text:''},extractPage:async()=>{calls++;return result();}});
 await assert.rejects(bad.start(),/Invalid rendered page/);assert.equal(calls,0);
});
test('invalid approval cannot finalize malformed data',async()=>{
 const config=workflowConfig({tenantId:'a',documentId:'bad-review'});
 const flow=createPageWorkflow({page,checkpointer:new MemorySaver(),requireApproval:true,extractPage:async()=>result()});
 await flow.start(config);await assert.rejects(flow.resume({approved:true,result:{fields:[]}},config),/Correct invalid fields/);
});
test('real PostgresSaver SQL migrates, restores state across instances, isolates threads and deletes history',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');
 const {createWorkflowStore}=await import('../lib/workflow-checkpointer.mjs');
 const db=new PGlite();
 const query=(s,a)=>db.query(typeof s==='object'?s.text:s,typeof s==='object'?s.values:a);
 const pool={query,connect:async()=>({query,release(){}})};
 try{
  const store=createWorkflowStore(pool);await store.migrate();
  const owner={tenantId:'alice',documentId:'invoice'};const config=store.config(owner);
  let calls=0;const first=createPageWorkflow({page,checkpointer:store.checkpointer,requireApproval:true,extractPage:async()=>{calls++;return result();}});
  const paused=await first.start(config);assert.equal(paused.__interrupt__.length,1);
  const freshStore=createWorkflowStore(pool);
  const next=createPageWorkflow({checkpointer:freshStore.checkpointer,requireApproval:true,extractPage:async()=>{throw new Error('no repeated model call');}});
  const other=await next.graph.getState(freshStore.config({tenantId:'bob',documentId:'invoice'}));assert.deepEqual(other.values,{});
  const resumed=await next.resume({approved:true},config);assert.equal(resumed.status,'completed');assert.equal(calls,1);
  await freshStore.delete(owner);const deleted=await next.graph.getState(config);assert.deepEqual(deleted.values,{});
 }finally{await db.close();}
});
