/** Browser-safe client for the same-origin, session-authenticated hosted job API. */
export function createDocumentJobClient({endpoint='/api/ai/jobs',fetch:fetchImpl=globalThis.fetch}={}){
 if(typeof endpoint!=='string'||!endpoint.startsWith('/')||endpoint.startsWith('//')||endpoint.includes('\\')||/[\r\n?#]/.test(endpoint))throw Error('Use a same-origin endpoint path');
 async function call(method,id,body,signal){
  const response=await fetchImpl(endpoint+(id?'?id='+encodeURIComponent(id):''),{method,credentials:'same-origin',redirect:'error',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal});
  const data=await response.json();if(!response.ok){const error=new Error(data.error||'Job request failed');error.status=response.status;throw error;}return data;
 }
 return {create:(pages,idempotencyKey,signal)=>call('POST',null,{pages,idempotency_key:idempotencyKey},signal),status:(id,signal)=>call('GET',id,null,signal),cancel:(id,signal)=>call('POST',id,{action:'cancel'},signal),retry:(id,signal)=>call('POST',id,{action:'retry'},signal),approve:(id,pages,signal)=>call('POST',id,{action:'approve',...(pages?{pages}:{})},signal),delete:(id,signal)=>call('DELETE',id,null,signal)};
}
