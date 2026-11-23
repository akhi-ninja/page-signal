import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import * as sdk from '../packages/sdk/contracts.mjs';import * as core from '../packages/core/contracts.mjs';import * as browser from '../web/result-contracts.mjs';
const page=()=>({document_type:'invoice',form_number:null,classification_status:'identified',page_role:'standalone',fields:[{section:'Buyer',label:'Name',value:'Example Buyer',state:'filled',evidence:'Name: Example Buyer'},{section:'Buyer',label:'Name',value:null,state:'blank',evidence:null}],tables:[{title:null,columns:['Item','Amount'],rows:[['Paper','10.00']]}],review_notes:[]});
const query=()=>({answer:'Example Buyer',citations:[{page:1,excerpt:'Name: Example Buyer'}],fields:[{label:'Name',value:'Example Buyer',source:{page:1,excerpt:'Name: Example Buyer'}},{label:'Missing',value:null,source:null}]});
test('page/query/document/error contracts round-trip identically across SDK, core and browser',()=>{
 const values=[sdk.toPageEnvelope(page(),{page:1,model:'fixture',prompt_version:'test-v1'}),sdk.toQueryEnvelope(query()),sdk.toDocumentEnvelope([{page:1,result:page()},{page:2,error:{code:'provider_timeout'}}]),sdk.toErrorEnvelope({error:'Retry later',code:'provider_rate_limit',retryable:true,retry_after_seconds:3})];
 for(const value of values)for(const entry of [sdk,core,browser])assert.deepEqual(entry.validateEnvelope(JSON.parse(JSON.stringify(value))),value);
 assert.notEqual(values[0].result.fields[0].id,values[0].result.fields[1].id);assert.equal(values[0].result.fields[1].original_value,null);
});
test('contracts reject malformed metadata, coordinates, rows, IDs and unsupported versions',()=>{
 assert.throws(()=>sdk.toPageEnvelope(page(),{page:0}));assert.throws(()=>sdk.toPageEnvelope(page(),{model:42}));assert.throws(()=>sdk.validateEvidence({page:1,excerpt:'value',box:{x:.9,y:0,width:.2,height:.1},coordinate_system:'normalized_upright_page'}));
 assert.throws(()=>sdk.validateEvidence({page:1,excerpt:'value',box:{x:0,y:0,width:.2,height:.1}}));
 assert.throws(()=>sdk.validateTable({columns:['a'],rows:[['a','b']]}));assert.throws(()=>sdk.validateQueryResult({...query(),fields:[{label:'Missing',value:null,source:{page:1,excerpt:'missing'}}]}));
 assert.throws(()=>sdk.validateErrorResult({error:'message',code:'bad',retryable:true,retry_after_seconds:301}));
 const p=sdk.toPageEnvelope(page());p.result.fields[1].id=p.result.fields[0].id;assert.throws(()=>sdk.validateEnvelope(p));assert.throws(()=>sdk.validateEnvelope({schema_version:'future.v9'}));
});
test('explicit legacy migrations preserve per-page failure, repeated fields, metadata and reviewed originals',()=>{
 const p=page();p.fields[0].original_value='Original';p.fields[0].reviewed=true;p.fields[0].value='Reviewed';const before=structuredClone(p);
 const e=sdk.migrateLegacyResult(p,{kind:'page',page:3});assert.equal(e.result.fields[0].original_value,'Original');assert.equal(e.result.fields[0].review_state,'manually_reviewed');assert.deepEqual(p,before);
 const d=sdk.migrateLegacyResult({schema_version:'3.0',pages:[{page:1,...page()},{page:2,error:'safe failure'}]},{kind:'workspace-v3'});assert.equal(d.pages[1].error.code,'page_failed');assert.equal(d.documents[0].fields.length,2);assert.throws(()=>sdk.migrateLegacyResult({fields:{}},{kind:'workspace-v3'}));
});
test('requested fields remain separately identified and cannot overwrite extraction or replay IDs',()=>{
 const existing=sdk.toPageEnvelope(page()).result.fields,merged=sdk.mergeRequestedFields(existing,query(),{queryId:'question-1'});
 assert.equal(merged.length,4);assert.equal(merged[0].value,'Example Buyer');assert.ok(merged[2].id.startsWith('question-1:'));assert.equal(new Set(merged.map(f=>f.id)).size,4);assert.throws(()=>sdk.mergeRequestedFields(merged,query(),{queryId:'question-1'}));
});
test('shared contract entrypoints stay browser-safe and generated copies match',async()=>{
 const source=await readFile(new URL('../packages/sdk/contracts.mjs',import.meta.url),'utf8');assert.ok(!/node:|process\.|fetch\(|@langchain|sharp|Authorization|OPENAI_API_KEY/.test(source));
 assert.equal(await readFile(new URL('../packages/core/contracts.mjs',import.meta.url),'utf8'),source);
});
test('documented JSON examples validate through all package contracts',async()=>{
 for(const name of ['page','query','document','error']){const value=JSON.parse(await readFile(new URL(`../examples/contracts/${name}.json`,import.meta.url),'utf8'));for(const api of [sdk,core,browser])api.validateEnvelope(value);}
});
