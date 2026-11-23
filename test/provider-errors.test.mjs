import test from 'node:test';import assert from 'node:assert/strict';import {providerFailure,applyUsageHeaders} from '../packages/core/provider-errors.mjs';
test('provider categories retain HTTP compatibility without exposing provider bodies',async()=>{
 for(const [status,code,retryable] of [[401,'provider_authentication',false],[400,'provider_invalid_request',false],[429,'provider_rate_limit',true],[503,'provider_unavailable',true]]){const response=providerFailure(new Response('private body',{status,headers:{'Retry-After':'999999'}}));assert.equal(response.status,502);const data=await response.json();assert.equal(data.code,code);assert.equal(data.retryable,retryable);assert.ok(!JSON.stringify(data).includes('private'));if(retryable)assert.equal(response.headers.get('retry-after'),'300');}
});
test('safe usage headers keep unknown model cost unmeasured and count cached tokens',()=>{
 const usage={input_tokens:1000,output_tokens:100,input_tokens_details:{cached_tokens:500}};const response=applyUsageHeaders(Response.json({}),{model:'gpt-4.1-mini',usage});assert.equal(response.headers.get('X-PageSignal-Input-Tokens'),'1000');assert.ok(Number(response.headers.get('X-PageSignal-Estimated-Cost-Usd'))>0);assert.equal(applyUsageHeaders(Response.json({}),{model:'unknown',usage}).headers.get('X-PageSignal-Estimated-Cost-Usd'),null);
});
