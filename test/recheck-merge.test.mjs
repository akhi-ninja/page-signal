import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecheck } from '../lib/recheck-merge.mjs';
import { createPageWorkflow } from '../lib/document-workflow.mjs';
const field=(label,value,evidence,state='filled')=>({section:null,label,value,evidence,state});
const original=()=>({document_type:'invoice',form_number:null,classification_status:'needs_review',fields:[field('ID','AB-01','ID: AB-01'),field('Email','bad','Email: bad')],tables:[],review_notes:[]});
const text='ID: AB-01\nEmail: team@example.test';
test('recheck fixes an uncertain value while preserving established fields and metadata',()=>{
 const a=original(),b=original();b.fields[1]=field('Email','team@example.test','Email: team@example.test');b.classification_status='identified';
 const m=mergeRecheck(a,b,text);assert.equal(m.result.fields[1].value,'team@example.test');assert.deepEqual(m.result.fields[0],a.fields[0]);assert.equal(m.result.classification_status,'identified');assert.deepEqual(a,original());
});
test('identity drift, established-value changes and table replacement are rejected',()=>{
 const a=original(),b=original();b.form_number='invented';assert.deepEqual(mergeRecheck(a,b,text).result,a);
 b.form_number=null;b.fields[0].value='AB-02';b.tables=[{columns:['x'],rows:[['invented']]}];
 const m=mergeRecheck(a,b,text);assert.deepEqual(m.result,a);assert.ok(m.rejected.includes('recheck_established_field_conflict'));assert.ok(m.rejected.includes('recheck_table_change_requires_review'));
});
test('unsupported corrections and ambiguous repeated labels do not silently merge',()=>{
 const a=original(),b=original();b.fields[1]=field('Email','invented@example.test','invented@example.test');assert.equal(mergeRecheck(a,b,text).result.fields[1].value,'bad');
 a.fields.push(field('Email','other','other'));b.fields.push(field('Email','team@example.test','Email: team@example.test'));
 assert.deepEqual(mergeRecheck(a,b,text).result.fields,a.fields);
});
test('graph preserves original extraction after malformed second result and requires review',async()=>{
 let calls=0;const first=original();
 const state=await createPageWorkflow({page:{image:'data:image/jpeg;base64,AA==',text},maxCalls:2,reserveAdditional:async()=>true,extractPage:async()=>++calls===1?first:null}).start();
 assert.equal(calls,2);assert.deepEqual(state.result,first);assert.equal(state.status,'needs_review');assert.ok(state.issues.includes('invalid_recheck_result'));
});
test('failed optional recheck preserves the successful first result without leaking provider errors',async()=>{
 let calls=0;const first=original();
 const state=await createPageWorkflow({page:{image:'data:image/jpeg;base64,AA==',text},maxCalls:2,reserveAdditional:async()=>true,extractPage:async()=>{if(++calls===1)return first;throw new Error('sensitive provider body');}}).start();
 assert.equal(calls,2);assert.deepEqual(state.result,first);assert.equal(state.status,'needs_review');assert.deepEqual(state.recheckIssues,['recheck_failed_original_preserved']);assert.ok(!JSON.stringify(state).includes('sensitive'));
});
