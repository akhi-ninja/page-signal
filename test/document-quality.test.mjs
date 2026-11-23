import test from 'node:test';
import assert from 'node:assert/strict';
import {assessScan,verifyFields,reconcilePages,cropRegion} from '../web/document-quality.mjs';
const field=(value,evidence)=>({section:'Contact',label:'Email',value,evidence,state:'filled'});
test('scan hints distinguish low resolution, transparent blank and low contrast samples',()=>{
 assert.deepEqual(assessScan({width:500,height:600,pixels:new Uint8ClampedArray([255,255,255,255])}).warnings,['low_resolution','possibly_blank']);
 assert.deepEqual(assessScan({width:1000,height:1500,pixels:new Uint8ClampedArray([0,0,0,0])}).warnings,['possibly_blank']);
 assert.deepEqual(assessScan({width:1000,height:1500,pixels:new Uint8ClampedArray([180,180,180,255])}).warnings,['low_contrast']);
 assert.equal(assessScan({width:1000,height:1500,pixels:new Uint8ClampedArray([0,0,0,255,255,255,255,255])}).orientation_checked,false);
});
test('evidence must contain the value and occur in the transcript, without repairing emails',()=>{
 let verified=verifyFields({fields:[field('a@example.test','Email: a@example.test')]},'Email: a@example.test',2)[0];
 assert.equal(verified.verification.status,'transcript_match');assert.equal(verified.verification.page,2);
 verified=verifyFields({fields:[field('a@example.test','Email:')]},'Email: b@example.test')[0];
 assert.equal(verified.verification.status,'needs_review');assert.ok(verified.verification.reasons.includes('evidence_does_not_contain_value'));
 verified=verifyFields({fields:[field('a example.test','Email: a example.test')]},'Email: a example.test')[0];
 assert.equal(verified.value,'a example.test');assert.ok(verified.verification.reasons.includes('invalid_email'));
 assert.equal(verifyFields({fields:[field('a@example.test','Email: a@example.test')]},'')[0].verification.status,'needs_review');
});
test('blank, unreadable, edited, and checkbox values keep distinct review states',()=>{
 const data=[{...field(null,null),state:'blank'},{...field(null,null),state:'illegible'},{...field('a',null),reviewed:true},{...field('yes','yes'),state:'checked'}];
 assert.deepEqual(verifyFields({fields:data},'yes').map(f=>f.verification.status),['blank','illegible','user_reviewed','needs_review']);
});
test('invalid ISO dates are flagged without guessing a corrected date',()=>{
 const f={section:null,label:'Start date',value:'2026-02-30',state:'filled',evidence:'2026-02-30'};
 assert.ok(verifyFields({fields:[f]},f.value)[0].verification.reasons.includes('invalid_calendar_date'));
 assert.equal(verifyFields({fields:[{...f,value:'2028-02-29',evidence:'2028-02-29'}]},'2028-02-29')[0].verification.status,'transcript_match');
});
test('cross-page conflicts preserve values and exclude different form identities and repeated labels',()=>{
 const page=(n,value,form='A')=>({page:n,document_type:'custom_form',form_number:form,fields:[field(value,value)]});
 const pages=[page(1,'a@example.test'),page(2,'b@example.test')];const snapshot=JSON.stringify(pages);
 const r=reconcilePages(pages);assert.equal(r.conflicts.length,1);assert.equal(r.conflicts[0].sources.length,2);assert.equal(JSON.stringify(pages),snapshot);
 assert.equal(reconcilePages([pages[0],page(2,'b@example.test','B')]).conflicts.length,0);
 pages[0].fields.push(field('c@example.test','c@example.test'));assert.equal(reconcilePages(pages).conflicts.length,0);
});
test('crop geometry clips padding and rejects out-of-page or invented coordinates',()=>{
 assert.deepEqual(cropRegion({x:0,y:0,width:.2,height:.3},1000,1000,.02),{x:0,y:0,width:220,height:320});
 assert.throws(()=>cropRegion({x:.9,y:0,width:.2,height:.3},1000,1000),/Invalid/);
 assert.throws(()=>cropRegion({x:NaN,y:0,width:.2,height:.3},1000,1000),/Invalid/);
});
test('source crop requires a unique non-label match on the requested page',async()=>{
 const {uniqueSourceRegion}=await import('../web/document-viewer.mjs');
 const words={1:[{text:'DEMO',x:.1,y:.1,width:.2,height:.02}],2:[{text:'OTHER',x:.1,y:.1,width:.2,height:.02}]};
 assert.equal(uniqueSourceRegion(words,[{text:'DEMO',kind:'value'}],1).x,.1);
 assert.throws(()=>uniqueSourceRegion(words,[{text:'DEMO',kind:'value'}],2),/unique/);
 assert.throws(()=>uniqueSourceRegion(words,[{text:'DEMO',kind:'label'}],1),/unique/);
 words[1].push({...words[1][0],y:.2});assert.throws(()=>uniqueSourceRegion(words,[{text:'DEMO',kind:'value'}],1),/unique/);
});
test('failed or superseded preview rendering cannot send a crop from a stale canvas',async()=>{
 const {DocumentViewer}=await import('../web/document-viewer.mjs');
 const target={job:{pageWords:{1:[{text:'DEMO',x:.1,y:.1,width:.2,height:.02}]}},version:1,renderedPage:2,renderedVersion:1,draw:async()=>{},host:{querySelector(){throw new Error('stale canvas must not be accessed');}}};
 await assert.rejects(DocumentViewer.prototype.cropSource.call(target,[{text:'DEMO',kind:'value'}],1),/preview changed/);
});
test('blur hint is a sampled edge heuristic, not a probability or automatic repair',()=>{
 const pixels=new Uint8ClampedArray(32*32*4);for(let y=0;y<32;y++)for(let x=0;x<32;x++){const i=(y*32+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=x*8;pixels[i+3]=255;}
 const r=assessScan({width:1200,height:800,pixels});assert.ok(r.warnings.includes('possibly_blurred'));assert.equal(r.assessment,'heuristic');assert.equal(r.orientation_checked,false);
});
test('corrupted monetary text requires review even if OCR and field evidence agree',()=>{
 const f={section:null,label:'Total',value:'4S.OO',state:'filled',evidence:'Total: 4S.OO'};const result=verifyFields({fields:[f]},'Total: 4S.OO')[0];assert.equal(result.value,'4S.OO');assert.ok(result.verification.reasons.includes('numeric_value_requires_review'));
 assert.equal(verifyFields({fields:[{...f,value:'45.00',evidence:'Total: 45.00'}]},'Total: 45.00')[0].verification.status,'transcript_match');
});
