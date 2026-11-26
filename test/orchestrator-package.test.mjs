import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageWorkflow,workflowConfig} from '../extensions/orchestrator/index.mjs';
const page={image:'data:image/jpeg;base64,YQ==',text:''};
const result={document_type:'unknown',classification_status:'needs_review',fields:[],tables:[],review_notes:[]};
test('preview preserves review state and denies extra calls by default',async()=>{
 let calls=0;
 const workflow=createPageWorkflow({page,maxCalls:2,extractPage:async()=>{calls++;return result;}});
 const state=await workflow.start({recursionLimit:16});
 assert.equal(calls,1);assert.equal(state.status,'needs_review');assert.equal(state.recheckSkipped,true);
});
test('workflow thread identifiers separate tenants',()=>{
 assert.notEqual(workflowConfig({tenantId:'a',documentId:'1'}).configurable.thread_id,workflowConfig({tenantId:'b',documentId:'1'}).configurable.thread_id);
});
test('approval requires checkpoint storage',()=>assert.throws(()=>createPageWorkflow({page,extractPage:async()=>result,requireApproval:true})));
