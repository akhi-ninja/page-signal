import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspace} from '../packages/sdk/workspace.mjs';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const image=name=>new File(['image'],name,{type:'image/png'});
test('native workspace validates the entire batch before uploading',()=>{
 const store=createWorkspace({adapter:{extract:async()=>({})},maxFiles:2,maxFileBytes:10});
 store.addFiles([image('a.png'),new File(['bad'],'bad.svg',{type:'image/svg+xml'})]);
 assert.equal(store.getSnapshot().documents.length,0);assert.match(store.getSnapshot().error,/Unsupported/);
 store.addFiles([image('a.png'),image('b.png'),image('c.png')]);assert.match(store.getSnapshot().error,/Maximum/);store.dispose();
});
test('parallel extraction isolates failures, edits values, queries and exports correct document',async()=>{
 let running=0,peak=0;const pending=[];
 const store=createWorkspace({adapter:{extract:({file})=>new Promise((resolve,reject)=>{running++;peak=Math.max(peak,running);pending.push({file,resolve:r=>{running--;resolve(r);},reject});}),query:async({file,question})=>({answer:file.name+': '+question})},concurrency:2});
 store.addFiles([image('a.png'),image('b.png'),image('c.png')]);await tick();assert.equal(pending.length,2);
 pending[0].resolve({fields:[{label:'Policy',value:'123'}]});await tick();assert.equal(pending.length,3);assert.equal(peak,2);
 pending[1].reject(new Error('Unreadable'));pending[2].resolve({fields:[]});await tick();
 assert.equal(store.getSnapshot().documents[1].status,'error');
 store.updateField('1',0,'456');await store.query('1','Policy?');
 const result=JSON.parse(store.exportJSON('1'));assert.equal(result.extraction.fields[0].value,'456');assert.equal(result.query.answer,'a.png: Policy?');store.dispose();
});
test('remove and disposal cancel work and ignore late extraction results',async()=>{
 let resolve,signal;const store=createWorkspace({adapter:{extract:input=>{signal=input.signal;return new Promise(r=>resolve=r);}}});
 store.addFiles([image('a.png')]);await tick();store.remove('1');assert.equal(signal.aborted,true);resolve({fields:[]});await tick();assert.equal(store.getSnapshot().documents.length,0);store.dispose();
});
test('a later query wins and stale query responses cannot overwrite it',async()=>{
 const pending=[];const store=createWorkspace({adapter:{extract:async()=>({fields:[]}),query:({signal})=>new Promise(resolve=>pending.push({signal,resolve}))}});
 store.addFiles([image('a.png')]);await tick();const first=store.query('1','first');const second=store.query('1','second');
 assert.equal(pending[0].signal.aborted,true);pending[1].resolve({answer:'second'});await second;pending[0].resolve({answer:'first'});await first;
 assert.equal(store.getSnapshot().documents[0].queryResult.answer,'second');store.dispose();
});

test('removing before scheduling never sends the document to the adapter',async()=>{
 let called=false;const store=createWorkspace({adapter:{extract:async()=>{called=true;return {};}}});
 store.addFiles([image('private.png')]);store.remove('1');await tick();assert.equal(called,false);store.dispose();
});
test('malformed adapter results produce a recoverable error',async()=>{
 const store=createWorkspace({adapter:{extract:async()=>({fields:{incorrect:'shape'}})}});
 store.addFiles([image('a.png')]);await tick();assert.equal(store.getSnapshot().documents[0].status,'error');store.dispose();
});
test('explicit question cancellation aborts the adapter and ignores a late response',async()=>{
 let signal,resolve;const store=createWorkspace({adapter:{extract:async()=>({fields:[]}),query:input=>{signal=input.signal;return new Promise(r=>resolve=r);}}});store.addFiles([image('a.png')]);await tick();const query=store.query('1','Question?');store.cancelQuery('1');assert.equal(signal.aborted,true);assert.equal(store.getSnapshot().documents[0].queryPending,false);resolve({answer:'late'});await query;assert.equal(store.getSnapshot().documents[0].queryResult,null);store.dispose();
});
test('native edits preserve original page-compatible values and explicit blank state',async()=>{
 const store=createWorkspace({adapter:{extract:async()=>({fields:[{section:null,label:'Name',value:'Original',state:'filled',evidence:'Original'}]})}});store.addFiles([image('a.png')]);await tick();store.updateField('1',0,'Reviewed');store.updateField('1',0,'');const field=store.getSnapshot().documents[0].result.fields[0];assert.equal(field.original_value,'Original');assert.equal(field.value,null);assert.equal(field.state,'blank');assert.equal(field.reviewed,true);store.dispose();
});
