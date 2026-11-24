import test from 'node:test';
import assert from 'node:assert/strict';
import { mapAcordSubmission } from './acord-mapping.mjs';
const profile={formNumber:'125',revision:'2020-01',version:'synthetic-1',fields:[{key:'namedInsured',aliases:['Fictional applicant']}]};
const page=(value='Example LLC',confirmed=true,revision='2020/01',evidence='Example LLC')=>({page:1,text:'ACORD 125 ('+revision+')',confirmedForm:confirmed?{formNumber:'125',revision:revision.replace('/','-')}:null,result:{fields:[{label:'Fictional applicant',state:'filled',value,evidence}]}});
const input=(...pages)=>({id:'demo',lineOfBusiness:'commercial-property',documents:pages.map((p,i)=>({id:'doc'+i,pages:[p]}))});
test('confirmed exact revision maps with provenance and required field findings',()=>{
 const out=mapAcordSubmission(input(page()),[profile]);
 assert.equal(out.fields.namedInsured.value,'Example LLC');
 assert.equal(out.fields.namedInsured.sources[0].mappingVersion,'synthetic-1');
 assert.equal(out.pages[0].mappingStatus,'mapped');
 assert(out.findings.some(f=>f.field==='propertyAddress'&&f.reason==='missing'));
 assert.equal(out.status,'needs_review');
});
test('unconfirmed and unknown revision pages cannot populate fields',()=>{
 const out=mapAcordSubmission(input(page('A',false),page('B',true,'2021/01')),[profile]);
 assert.equal(out.fields.namedInsured.value,null);
 assert.deepEqual(out.pages.map(p=>p.mappingStatus),['confirmation_required','profile_missing']);
});
test('cross-document conflict preserves both sources without selecting a winner',()=>{
 const out=mapAcordSubmission(input(page('A'),page('B')),[profile]);
 assert.equal(out.fields.namedInsured.value,null);
 assert.equal(out.fields.namedInsured.sources.length,2);
 assert(out.findings.some(f=>f.reason==='conflict'));
});
test('missing evidence is flagged even when another source has evidence',()=>{
 const out=mapAcordSubmission(input(page(),page('Example LLC',true,'2020/01','')),[profile]);
 assert(out.findings.some(f=>f.field==='namedInsured'&&f.reason==='missing_evidence'));
});
test('duplicate revision and ambiguous aliases are rejected',()=>{
 assert.throws(()=>mapAcordSubmission(input(page()),[profile,profile]),/Duplicate/);
 assert.throws(()=>mapAcordSubmission(input(page()),[{...profile,fields:[...profile.fields,{key:'effectiveDate',aliases:['fictional applicant']}]}]),/Ambiguous/);
});
test('ambiguous page identity is never mapped',()=>{
 const p=page();p.text+='\nACORD 140 (2020/01)';
 const out=mapAcordSubmission(input(p),[profile]);
 assert.equal(out.pages[0].mappingStatus,'ambiguous');
 assert.equal(out.fields.namedInsured.value,null);
});
