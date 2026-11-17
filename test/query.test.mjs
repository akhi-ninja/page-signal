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
