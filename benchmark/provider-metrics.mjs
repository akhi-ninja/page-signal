// Records only provider status/model/token counts. Never retain requests, headers, or model text.
export function providerMeter(fetchImpl,{model,maxCostUsd}={}){
 const calls=[];
 const rates={input:.40,cached:.10,output:1.60};
 const supported=/^gpt-4\.1-mini(?:-2025-04-14)?$/.test(model||'');
 if(maxCostUsd!==undefined&&(!supported||!Number.isFinite(maxCostUsd)||maxCostUsd<=0))throw new Error('Cost budget requires a supported model and positive finite USD amount.');
 const worstCall=(1047576*rates.input+14000*rates.output)/1e6;
 const spent=()=>calls.reduce((sum,c)=>sum+(c.estimatedCostUsd??worstCall),0);
 return {calls,fetch:async(input,init)=>{
  const url=typeof input==='string'?input:input.url;
  if(url!=='https://api.openai.com/v1/responses')throw new Error('Benchmark permits only the OpenAI Responses endpoint.');
  if(maxCostUsd!==undefined&&spent()+worstCall>maxCostUsd)throw new Error('Benchmark estimated cost budget reached.');
  const call={httpStatus:null,model:null,usage:null,estimatedCostUsd:null};calls.push(call);
  const response=await fetchImpl(input,init);call.httpStatus=response.status;
  try{
   const body=await response.clone().json();call.model=body.model??null;call.serviceTier=body.service_tier??null;
   const usage=body.usage;
   if(usage&&Number.isInteger(usage.input_tokens)&&usage.input_tokens>=0&&Number.isInteger(usage.output_tokens)&&usage.output_tokens>=0){
    const cached=usage.input_tokens_details?.cached_tokens??0;
    if(Number.isInteger(cached)&&cached>=0&&cached<=usage.input_tokens){
     call.usage={inputTokens:usage.input_tokens,cachedInputTokens:cached,outputTokens:usage.output_tokens};
     if(supported&&/^gpt-4\.1-mini(?:-2025-04-14)?$/.test(call.model||'')&&(!call.serviceTier||call.serviceTier==='default'))call.estimatedCostUsd=((usage.input_tokens-cached)*rates.input+cached*rates.cached+usage.output_tokens*rates.output)/1e6;
    }
   }
  }catch{}
  return response;
 },summary(){
  const measured=calls.filter(c=>c.usage);const known=calls.filter(c=>c.estimatedCostUsd!==null);
  return {requests:calls.length,usageMeasuredRequests:measured.length,tokenUsage:measured.length?measured.reduce((s,c)=>({inputTokens:s.inputTokens+c.usage.inputTokens,cachedInputTokens:s.cachedInputTokens+c.usage.cachedInputTokens,outputTokens:s.outputTokens+c.usage.outputTokens}),{inputTokens:0,cachedInputTokens:0,outputTokens:0}):null,estimatedCostUsd:calls.length&&known.length===calls.length?known.reduce((s,c)=>s+c.estimatedCostUsd,0):null,knownEstimatedCostUsd:known.reduce((s,c)=>s+c.estimatedCostUsd,0),costNote:'Estimate from measured tokens at standard GPT-4.1 mini rates: input $0.40, cached input $0.10, output $1.60 per million. Excludes Vercel, tax and discounts. Unknown usage/tier is not treated as free.',pricingSource:'https://developers.openai.com/api/docs/models/gpt-4.1-mini',pricingCheckedOn:'2026-11-22',calls};
 }};
}
