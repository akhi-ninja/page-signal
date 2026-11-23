import test from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';
import {prepareTargetedRecheck,cropProposal} from '../lib/targeted-recheck.mjs';import {createPageWorkflow} from '../lib/document-workflow.mjs';
const field={section:null,label:'Email',value:'bad',state:'filled',evidence:'bad'};
const result=()=>({document_type:'invoice',form_number:null,classification_status:'identified',fields:[field],tables:[],review_notes:[]});
test('targeted crop reads bounded actual pixels and returns a review-only proposal',async()=>{
 const buffer=await sharp({create:{width:1000,height:800,channels:3,background:'white'}}).jpeg().toBuffer();const page={image:'data:image/jpeg;base64,'+buffer.toString('base64'),text:'Email bad',words:[{text:'bad',x:.2,y:.2,width:.1,height:.03}]};
 const prepared=await prepareTargetedRecheck(result(),page);assert.equal(prepared.mode,'crop_proposal');const metadata=await sharp(Buffer.from(prepared.page.image.split(',')[1],'base64')).metadata();assert.ok(metadata.width<1000);assert.equal(prepared.page.text,'');
 let calls=0;const cropResult=result();cropResult.document_type='unknown';cropResult.fields=[{...field,value:'team@example.test',evidence:'team@example.test'}];
 const state=await createPageWorkflow({page,maxCalls:2,prepareRecheck:prepareTargetedRecheck,reserveAdditional:async()=>true,extractPage:async()=>++calls===1?result():cropResult}).start();assert.equal(calls,2);assert.equal(state.result.fields[0].value,'bad');assert.equal(state.result.vision_recheck[0].proposal.value,'team@example.test');assert.equal(state.status,'needs_review');
});
test('ambiguous, label-only or missing coordinates never spend an extra provider call',async()=>{
 const page={image:'data:image/jpeg;base64,AA==',text:'Email bad',words:[]};let calls=0,reserved=0;
 const state=await createPageWorkflow({page,maxCalls:2,prepareRecheck:prepareTargetedRecheck,reserveAdditional:async()=>{reserved++;return true;},extractPage:async()=>{calls++;return result();}}).start();assert.equal(calls,1);assert.equal(reserved,0);assert.equal(state.recheckSkipped,true);
 const duplicate=result();duplicate.fields.push({...field});assert.equal(await prepareTargetedRecheck(duplicate,{...page,words:[{text:'bad',x:.2,y:.2,width:.1,height:.03}]}),null);
 assert.deepEqual(cropProposal(result(),{fields:[]},{label:'Email',section:null}).rejected,['crop_target_not_unique']);
});

test('a label-only evidence span cannot trigger a crop even with valid pixels',async()=>{
 const buffer=await sharp({create:{width:1000,height:800,channels:3,background:'white'}}).jpeg().toBuffer();
 const r=result();r.fields[0]={...field,evidence:'Email:'};
 assert.equal(await prepareTargetedRecheck(r,{image:'data:image/jpeg;base64,'+buffer.toString('base64'),text:'Email: bad',words:[{text:'Email:',x:.2,y:.2,width:.1,height:.03}]}),null);
});
