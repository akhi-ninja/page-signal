import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PageSignalClient } from '../packages/sdk/index.mjs';
import { extractPage } from '../packages/core/index.mjs';

test('SDK sends credential to intended server and returns extraction', async () => {
  const client = new PageSignalClient({
    baseUrl: 'https://selfhost.example',
    apiKey: 'service-test',
    fetch: async (url, init) => {
      assert.equal(url, 'https://selfhost.example/api/ai/extract');
      assert.equal(init.headers.Authorization, 'Bearer service-test');
      assert.equal(init.redirect, 'error');
      assert.equal(JSON.parse(init.body).text, 'invoice');
      return Response.json({ document_type: 'invoice' });
    }
  });
  assert.equal((await client.extractPage({ image: 'data:image/jpeg;base64,AA==', text: 'invoice' })).document_type, 'invoice');
});
test('SDK propagates service rejection', async () => {
  const client = new PageSignalClient({ baseUrl: 'http://localhost:3000', apiKey: 'test',
    fetch: async () => Response.json({ error: 'Capacity reached' }, { status: 429 }) });
  await assert.rejects(client.extractPage({ image: 'test' }), { status: 429 });
});
test('core rejects missing credential before processing', async () => {
  await assert.rejects(extractPage({ image: 'test' }), { status: 503 });
});

test('SDK document queries use the service credential and preserve atomic field results',async()=>{
 const client=new PageSignalClient({baseUrl:'https://selfhost.example',apiKey:'service-test',fetch:async(url,init)=>{
  assert.equal(url,'https://selfhost.example/api/ai/extract');assert.equal(init.headers.Authorization,'Bearer service-test');assert.equal(init.redirect,'error');
  const body=JSON.parse(init.body);assert.equal(body.operation,'document_query');assert.equal(body.context,'');assert.equal(body.mode,'chat');assert.equal(body.pages[0].page,1);
  return Response.json({answer:'Policy P-1042',citations:[{page:1,excerpt:'P-1042'}],fields:[{label:'Policy',value:'P-1042',source:{page:1,excerpt:'P-1042'}}]});
 }});
 const result=await client.queryDocument({pages:[{page:1,text:'Policy P-1042'}],question:'Policy number?',mode:'chat'});assert.equal(result.fields[0].value,'P-1042');
});
test('SDK query errors preserve server status',async()=>{
 const client=new PageSignalClient({baseUrl:'https://selfhost.example',apiKey:'test',fetch:async()=>Response.json({error:'No readable text'},{status:400})});
 await assert.rejects(client.queryDocument({pages:[],question:'Policy number?'}),{status:400});
});
test('core query API runs source grounding and rejects unsupported values',async()=>{
 const {queryDocument}=await import('../packages/core/index.mjs');const original=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(init.headers.Authorization,'Bearer provider-test');
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({answer:'Policy P-1042',citations:[{page:1,excerpt:'P-1042'}],fields:[{label:'Policy',value:'P-1042',source:{page:1,excerpt:'P-1042'}},{label:'Fee',value:500,source:{page:1,excerpt:'P-1042'}}]})}]}]});
 };
 try{const r=await queryDocument({pages:[{page:1,text:'Policy P-1042'}],question:'Policy and fee?'},{apiKey:'provider-test'});assert.equal(r.fields[0].value,'P-1042');assert.equal(r.fields[1].value,null);}
 finally{globalThis.fetch=original;}
 await assert.rejects(queryDocument({pages:[],question:'Policy?'}),{status:503});
});
