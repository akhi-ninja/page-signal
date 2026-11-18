import {test} from 'node:test';
import assert from 'node:assert/strict';
import {locateEvidence,ocrWordBoxes,pdfWordBoxes} from '../web/document-viewer.mjs';
const word=(text,x=0)=>({text,x,y:.2,width:.1,height:.03});
test('source matching prefers the cited page and retains source coordinates',()=>{
 const pages={1:[word('INV-10482')],2:[word('INV-10482',.4)]};
 const result=locateEvidence(pages,[{kind:'value',text:'INV-10482'}],2);
 assert.equal(result.page,2);assert.equal(result.matches[0][0].x,.4);
});
test('ambiguous matches remain explicit and missing text never gets invented coordinates',()=>{
 assert.equal(locateEvidence({1:[word('$250.00'),word('$250.00')]},[{kind:'value',text:'250.00'}],1).matches.length,2);
 assert.equal(locateEvidence({1:[word('Total')]},[{kind:'value',text:'missing'}],1),null);
 assert.equal(locateEvidence({},[{text:null}],1),null);
});
test('label fallback is distinguished from a matched value',()=>{
 const result=locateEvidence({1:[word('Policy Number')]},[{kind:'value',text:'missing'},{kind:'label',text:'Policy number'}],1);
 assert.equal(result.kind,'label');
});
test('nested OCR word boxes normalize image coordinates',()=>{
 const data={blocks:[{paragraphs:[{lines:[{words:[{text:'Policy',bbox:{x0:100,y0:200,x1:300,y1:240}}]}]}]}]};
 assert.deepEqual(ocrWordBoxes(data,1000,2000),[{text:'Policy',x:.1,y:.1,width:.2,height:.02}]);
});
test('PDF text boxes map to normalized rendered page coordinates',()=>{
 const boxes=pdfWordBoxes([{str:'Invoice',width:60,transform:[12,0,0,12,100,200]}],{width:600,height:800,scale:1},()=>[12,0,0,-12,100,600]);
 assert.equal(boxes[0].x,1/6);assert.equal(boxes[0].y,588/800);assert.equal(boxes[0].width,.1);
});
