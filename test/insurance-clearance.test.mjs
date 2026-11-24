import test from 'node:test';import assert from 'node:assert/strict';import {reviewAccountClearance as review} from '../extensions/insurance/clearance.mjs';
const business={legalName:'Example LLC',duns:'123456789'};const submission={id:'new',business,lineOfBusiness:'property'};const account={...business,id:'a',source:'fixture',evidence:'fictional record',submissions:[{id:'old',lineOfBusiness:'property',status:'open'}]};
const run=(accounts)=>review({synthetic:true,submission,accounts});
test('potential duplicate requires review',()=>{const r=run([account]);assert.equal(r.findings[0].reason,'potential_duplicate');assert.equal(r.status,'needs_review')});
test('different line and self excluded',()=>assert.equal(run([{...account,submissions:[{id:'new',lineOfBusiness:'property',status:'open'},{id:'old',lineOfBusiness:'auto',status:'open'}]}]).findings.length,0));
test('conflicting identity flagged',()=>assert.equal(run([{...account,duns:'987654321'}]).findings[0].reason,'identity_conflict'));
test('empty inventory not clearance approval',()=>assert.equal(run([]).status,'needs_review'));
test('reject non synthetic and malformed status',()=>{assert.throws(()=>review({submission,accounts:[]}));assert.throws(()=>run([{...account,submissions:[{id:'old',lineOfBusiness:'property',status:'bad'}]}]))});
