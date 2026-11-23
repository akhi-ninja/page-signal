import test from 'node:test';import assert from 'node:assert/strict';import {providerFailure,applyUsageHeaders} from '../packages/core/provider-errors.mjs';
test('provider categories retain HTTP compatibility without exposing provider bodies',async()=>{
 for(const [status,code,retryable] of [[401,'provider_authentication',false],[400,'provider_invalid_request',false],[429,'provider_rate_limit',true],[503,'provider_unavailable',true]]){const response=providerFailure(new Response('private body',{status,headers:{'Retry-After':'999999'}}));assert.equal(response.status,502);const data=await response.json();assert.equal(data.code,code);assert.equal(data.retryable,retryable);assert.ok(!JSON.stringify(data).includes('private'));if(retryable)assert.equal(response.headers.get('retry-after'),'300');}
});
test('safe usage headers keep unknown model cost unmeasured and count cached tokens',()=>{
 const usage={input_tokens:1000,output_tokens:100,input_tokens_details:{cached_tokens:500}};const response=applyUsageHeaders(Response.json({}),{model:'gpt-4.1-mini',usage});assert.equal(response.headers.get('X-PageSignal-Input-Tokens'),'1000');assert.ok(Number(response.headers.get('X-PageSignal-Estimated-Cost-Usd'))>0);assert.equal(applyUsageHeaders(Response.json({}),{model:'unknown',usage}).headers.get('X-PageSignal-Estimated-Cost-Usd'),null);
});

test('hosted and packaged query cancellation reaches upstream with a typed safe error',async()=>{
 const hosted=(await import('../lib/extraction.mjs')).extract,packaged=(await import('../packages/core/extraction.mjs')).extract;const original=globalThis.fetch;
 try{for(const extract of [hosted,packaged]){
  const controller=new AbortController();let entered;const started=new Promise(r=>entered=r);
  globalThis.fetch=async(_url,init)=>{entered();return new Promise((_resolve,reject)=>{if(init.signal.aborted)return reject(init.signal.reason);init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});});};
  const work=extract(new Request('https://example.test/api/ai/extract',{method:'POST',signal:controller.signal,headers:{Origin:'https://example.test','Content-Type':'application/json'},body:JSON.stringify({operation:'document_query',mode:'fields',question:'ID?',context:'',pages:[{page:1,text:'ID: A-1'}]})}),{OPENAI_API_KEY:'test'});
  await started;controller.abort();const response=await work;assert.equal(response.status,502);assert.equal((await response.json()).code,'provider_cancelled');
 }}finally{globalThis.fetch=original;}
});
test('core and SDK retain safe provider categories and retry hints for callers',async()=>{
 const {extractPage}=await import('../packages/core/index.mjs');const {PageSignalClient}=await import('../packages/sdk/index.mjs');const original=globalThis.fetch;
 try{globalThis.fetch=async()=>new Response('private provider detail',{status:429,headers:{'Retry-After':'3'}});await assert.rejects(extractPage({image:'data:image/jpeg;base64,AA==',text:''},{apiKey:'test'}),{status:502,code:'provider_rate_limit',retryable:true,retryAfterSeconds:3});}
 finally{globalThis.fetch=original;}
 const client=new PageSignalClient({baseUrl:'https://example.test',apiKey:'test',fetch:async()=>Response.json({error:'Try later',code:'provider_rate_limit',retryable:true,retry_after_seconds:3},{status:502})});
 await assert.rejects(client.queryDocument({pages:[{page:1,text:'ID A-1'}],question:'ID?'}),{status:502,code:'provider_rate_limit',retryable:true,retryAfterSeconds:3});
});
