import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scorePage, scoreSuite, summarize } from '../benchmark/scorer.mjs';
const expected={document_type:'invoice',form_number:null,fields:[{section:'A',label:'Name',value:'Example One',state:'filled'},{section:'B',label:'Name',value:'Example Two',state:'filled'},{section:null,label:'Email',value:null,state:'blank'}],tables:[{columns:['Item','Price'],rows:[['Paper','2.00']]}]};
const source='Name: Example One\nName: Example Two';
const perfect=()=>({...structuredClone(expected),fields:expected.fields.map(f=>({...f,evidence:f.value?`Name: ${f.value}`:null}))});
test('normalizes whitespace but preserves identifiers and blank values',()=>{
 const actual=perfect();actual.fields[0].value='Example   One';
 assert.equal(summarize(scorePage(expected,actual,source)).metrics.fieldRecall,1);
 actual.fields[2].value='';
 assert.equal(scorePage(expected,actual,source).unsupportedValues,1);
});
test('missing predictions penalize recall, state, table and evidence metrics',()=>{
 const m=summarize(scorePage(expected,null,source)).metrics;
 assert.equal(m.fieldRecall,0);assert.equal(m.evidenceRecall,0);assert.equal(m.tableCellAccuracy,0);assert.equal(m.fieldPrecision,null);
});
test('repeated labels are separated by section and matched in occurrence order',()=>{
 const actual=perfect();actual.fields[0].value='Example Two';actual.fields[1].value='Example One';
 assert.equal(scorePage(expected,actual,source).correctValues,0);
 const repeated={...expected,fields:[expected.fields[0],expected.fields[0]]};
 assert.equal(scorePage(repeated,{...perfect(),fields:[perfect().fields[0]]},source).correctValues,1);
});
test('invented values, blank-field fills and extra fields penalize precision',()=>{
 const actual=perfect();actual.fields.push({section:null,label:'Phone',value:'555-0100',state:'filled'});actual.fields[2].value='invented@example.test';
 const m=summarize(scorePage(expected,actual,source)).metrics;
 assert.equal(m.fieldPrecision,.5);assert.equal(m.unsupportedValueRate,.5);
});
test('wrong, empty and label-only evidence cannot earn evidence credit',()=>{
 const actual=perfect();actual.fields[0].evidence='Name:';actual.fields[1].evidence='Not in source Example Two';
 assert.equal(scorePage(expected,actual,source).correctEvidence,0);
});
test('missing null table cells do not equal annotated blank cells; extras are reported',()=>{
 const wanted={...expected,tables:[{columns:['Item','Price'],rows:[['Paper',null]]}]};
 const actual=perfect();actual.tables=[{columns:['Item','Price'],rows:[['Paper']]}];
 assert.equal(scorePage(wanted,actual,source).correctCells,3);
 actual.tables[0].rows[0]=['Paper',null,'extra'];assert.equal(scorePage(wanted,actual,source).extraCells,1);
});
test('fixture corpus has only synthetic provenance, real JPEGs and category/quality groups',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../benchmark/fixtures/manifest.json',import.meta.url)));
 for(const fixture of manifest.fixtures){
  assert.match(fixture.provenance,/synthetic/);
  const bytes=await readFile(new URL('../benchmark/fixtures/'+fixture.image,import.meta.url));assert.equal(bytes.readUInt16BE(0),0xffd8);
 }
 const result=scoreSuite(manifest,{});assert.equal(result.sampleCount,6);assert.equal(result.groups.all.metrics.fieldRecall,0);assert.ok(result.groups['quality:rotated']);
});
test('malformed offline predictions are rejected with a useful error',()=>{
 for (const actual of [{...perfect(),fields:[null]},{...perfect(),tables:[{columns:['A'],rows:[null]}]},{...perfect(),fields:[{label:'A',value:42,state:'filled',section:null}]}]) assert.throws(()=>scorePage(expected,actual,source),/Invalid page prediction/);
});
