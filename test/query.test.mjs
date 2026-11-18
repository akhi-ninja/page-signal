import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extract } from '../lib/extraction.mjs';

test('document queries discard unsupported values and citations', async () => {
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({
  status:'completed',
  output:[{content:[{type:'output_text',text:JSON.stringify({
   answer:'Notice is 60 days',
   citations:[{page:1,excerpt:'60 days'},{page:2,excerpt:'missing'}],
   fields:[{label:'notice',value:60,source:{page:1,excerpt:'60 days'}},
           {label:'fee',value:500,source:{page:2,excerpt:'missing'}}]
  })}]}]
 });
 try{
  const response=await extract(new Request('https://example.com/api/ai/extract',{
   method:'POST',headers:{origin:'https://example.com','content-type':'application/json'},
   body:JSON.stringify({operation:'document_query',mode:'fields',question:'Find notice and fee',
     context:'',pages:[{page:1,text:'Please provide 60 days written notice.'}]})
  }),{OPENAI_API_KEY:'test'});
  const result=await response.json();
  assert.equal(response.status,200);
  assert.equal(result.citations.length,1);
  assert.equal(result.fields[0].value,60);
  assert.equal(result.fields[1].value,null);
 }finally{globalThis.fetch=original;}
});


test('a real citation cannot justify a guessed email or unrelated field value',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({
  answer:'Email is person@example.com',citations:[{page:1,excerpt:'Email: PERSON EXAMPLE COM'}],
  fields:[{label:'Email',value:'person@example.com',source:{page:1,excerpt:'Email: PERSON EXAMPLE COM'}},
   {label:'Date',value:'01/01/2026',source:{page:1,excerpt:'Date of most recent entry'}}]
 })}]}]});
 try{
  const r=await extract(new Request('https://example.com/api/ai/extract',{method:'POST',headers:{origin:'https://example.com','content-type':'application/json'},body:JSON.stringify({operation:'document_query',mode:'fields',question:'email and date',context:'',pages:[{page:1,text:'Email: PERSON EXAMPLE COM. Date of most recent entry'}]})}),{OPENAI_API_KEY:'test'});
  const result=await r.json();assert.equal(result.fields[0].value,null);assert.equal(result.fields[1].value,null);assert.ok(!result.answer.includes('person@example.com'));
 }finally{globalThis.fetch=original;}
});

test('local OCR rejects date labels and corrupted emails but retains literal values',async()=>{
 const {runInNewContext}=await import('node:vm');const {readFileSync}=await import('node:fs');
 const result=runInNewContext(readFileSync(new URL('../web/engine.js',import.meta.url),'utf8')+`;({bad:extractFields('Date of Last Arrival Into the Form I-94 Arrival Record\\nEmail: PERSON EXAMPLE COM',{type:'other'}),good:extractFields('Date: 09/26/2025\\nEmail: person@example.com',{type:'other'})})`);
 assert.equal(result.bad.date.value,null);assert.equal(result.bad.email.value,null);assert.equal(result.good.date.value,'09/26/2025');assert.equal(result.good.email.value,'person@example.com');
});
