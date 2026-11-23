import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {readingOptions} from '../web/reading-options.mjs';
import {reconcileDocument} from '../packages/sdk/document.mjs';
import {assessScan,verifyFields,reconcilePages} from '../web/document-quality.mjs';
test('workspace shows review hints, makes no automatic verification call, and requires explicit acceptance',async()=>{
 const html=await readFile(new URL('../web/index.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'https://example.test',runScripts:'outside-only'});const w=dom.window;
 Object.assign(w,{readingOptions,reconcileDocument,assessScan,verifyFields,reconcilePages,loadOCR:async()=>{},pdfWordBoxes:()=>[],ocrWordBoxes:()=>[]});
 w.PageSignalAccount={state:{configured:true,user:{name:'Test'},authRequired:true},ready:Promise.resolve(),ensureSignedIn:async()=>true,refresh:async()=>{}};
 w.DocumentViewer=class{constructor(host,job){this.job=job;}destroy(){}async cropSource(){return {image:'data:image/jpeg;base64,AA==',source:{page:1,region:{x:.1,y:.1,width:.1,height:.1}}};}};
 let calls=0;
 w.fetch=async(url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.text,'');return {ok:true,json:async()=>({fields:[{section:null,label:'Email',value:'new@example.test',state:'filled',evidence:'new@example.test'}]})};};
 const engine=await readFile(new URL('../web/engine.js',import.meta.url),'utf8');
 const app=(await readFile(new URL('../web/app.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
 w.eval(engine+'\n'+app+`\nwindow.qualityHarness={output,getJob:()=>jobs[0],setup:()=>{const job={id:'q',name:'sample.pdf',status:'Complete',valid:true,ai:true,pages:1,text:'Email: old@example.test',pageTexts:{1:'Email: old@example.test'},ocrPages:[],scanQuality:{1:{warnings:['low_resolution']}},classification:{type:'invoice'},fields:{},aiPages:[{page:1,document_type:'invoice',classification_status:'identified',fields:[{section:null,label:'Email',value:'old@example.test',state:'filled',evidence:'Email: old@example.test'}],tables:[],review_notes:[]}]};jobs.push(job);selected='q';tab='AI review';render();}};`);
 try{
  await new Promise(r=>setImmediate(r));w.qualityHarness.setup();
  assert.match(w.document.getElementById('result').textContent,/transcript match/);assert.match(w.document.getElementById('result').textContent,/low resolution/);assert.equal(calls,0);
  w.document.querySelector('[data-recheck-page]').click();await new Promise(r=>setImmediate(r));
  assert.equal(calls,1);assert.equal(w.qualityHarness.getJob().aiPages[0].fields[0].value,'old@example.test');
  w.document.querySelector('[data-apply-recheck-page]').click();
  const job=w.qualityHarness.getJob();assert.equal(job.aiPages[0].fields[0].value,'new@example.test');
  assert.equal(w.qualityHarness.output(job).pages[0].fields[0].verification.status,'user_reviewed');
  assert.equal(job.aiPages[0].fields[0].original_value,'old@example.test');
  job.requestedFields={followup:{label:'Email',value:'followup@example.test',source:{page:1,excerpt:'followup@example.test'}}};
  const exported=w.qualityHarness.output(job);assert.equal(exported.fields.email,'new@example.test');assert.equal(exported.fields.email_2,'followup@example.test');
 }finally{w.close();}
});
