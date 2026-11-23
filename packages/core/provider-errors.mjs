export function providerFailure(response){
 const status=response.status;
 const code=status===429?'provider_rate_limit':[401,403].includes(status)?'provider_authentication':status>=500?'provider_unavailable':'provider_invalid_request';
 const retryable=status===429||status>=500;
 const supplied=Number(response.headers.get('retry-after'));
 const retryAfter=retryable?Math.min(300,Math.max(1,Number.isFinite(supplied)&&supplied>0?Math.ceil(supplied):60)):null;
 return Response.json({error:'The AI provider could not complete this request.',code,retryable,retry_after_seconds:retryAfter},{status:502,headers:{'Cache-Control':'no-store',...(retryAfter?{'Retry-After':String(retryAfter)}:{})}});
}
export function applyUsageHeaders(response,data){
 const u=data?.usage,cached=u?.input_tokens_details?.cached_tokens??0;
 if(![u?.input_tokens,u?.output_tokens,cached].every(x=>Number.isInteger(x)&&x>=0)||cached>u.input_tokens)return response;
 response.headers.set('X-PageSignal-Input-Tokens',String(u.input_tokens));response.headers.set('X-PageSignal-Output-Tokens',String(u.output_tokens));response.headers.set('X-PageSignal-Cached-Tokens',String(cached));
 if(/^gpt-4\.1-mini(?:-2025-04-14)?$/.test(data.model||'')&&(!data.service_tier||data.service_tier==='default'))response.headers.set('X-PageSignal-Estimated-Cost-Usd',String(((u.input_tokens-cached)*.4+cached*.1+u.output_tokens*1.6)/1000000));
 return response;
}
export function providerException(error,signal){
 const code=signal?.aborted?'provider_cancelled':error?.name==='TimeoutError'?'provider_timeout':error instanceof SyntaxError?'provider_malformed_output':'provider_network_error';
 return Response.json({error:'The AI request could not complete.',code,retryable:false},{status:502,headers:{'Cache-Control':'no-store'}});
}
export function providerIncomplete(){return Response.json({error:'The AI response was incomplete.',code:'provider_malformed_output',retryable:false},{status:502,headers:{'Cache-Control':'no-store'}});}
