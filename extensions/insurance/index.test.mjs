import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSubmission, validateSubmission} from './index.mjs';
const input = {id:'s1',lineOfBusiness:'commercial-property',documents:[{id:'d1',pages:[{page:1,result:{fields:[{label:'Named insured',value:'Example LLC',state:'filled',evidence:'Named insured Example LLC'},{label:'Limit',value:null,state:'blank'}]}}]}]};
test('preserves evidence and reports missing fields',()=>{const s=createSubmission(input);assert.equal(s.evidence[0].documentId,'d1');assert.equal(s.evidence[0].page,1);assert.deepEqual(validateSubmission(s,['Named insured','Limit']).findings,[{label:'Limit',reason:'missing'}]);});
test('conflicting values require review',()=>{const i=structuredClone(input);i.documents[0].pages[0].result.fields.push({label:'Named insured',value:'Other LLC',state:'filled'});assert.equal(validateSubmission(createSubmission(i),['Named insured']).findings[0].reason,'conflict');});
test('duplicate documents rejected',()=>assert.throws(()=>createSubmission({...input,documents:[...input.documents,...input.documents]}),TypeError));
test('missing evidence requires review',()=>{const i=structuredClone(input);delete i.documents[0].pages[0].result.fields[0].evidence;assert.equal(validateSubmission(createSubmission(i),['Named insured']).findings[0].reason,'missing_evidence');});
