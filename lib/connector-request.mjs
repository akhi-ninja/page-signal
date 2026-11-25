import {isIP} from 'node:net';
// Explicit operator-approved origins only. No wildcard, redirects or arbitrary request headers.
export function prepareConnectorRequest(connection,operation,secret,env=process.env){
 const base=new URL(connection.endpoint);
 const allowed=(env.PAGESIGNAL_CONNECTOR_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(base.protocol!=='https:'||base.username||base.password||base.port||base.search||base.hash||isIP(base.hostname.replace(/^\[|\]$/g,''))||!allowed.includes(base.origin))throw Error('Endpoint not approved');
 if(!operation||!['GET','HEAD','POST'].includes(operation.method))throw Error('Unsupported method');
 const path=operation.path??base.pathname;
 if(typeof path!=='string'||path.length>2048||!path.startsWith('/')||path.startsWith('//')||path.includes('\\'))throw Error('Invalid path');
 const url=new URL(path,base.origin);
 if(url.origin!==base.origin||url.hash||url.username||url.password)throw Error('Invalid request destination');
 const headers=new Headers({Accept:'application/json'});
 if(connection.auth==='Bearer token'||connection.auth==='API key header'){
 if(typeof secret!=='string'||!secret||secret.length>16384||/[\r\n]/.test(secret))throw Error('Invalid credential');
 headers.set(connection.auth==='Bearer token'?'Authorization':'X-API-Key',connection.auth==='Bearer token'?'Bearer '+secret:secret);
 }else if(connection.auth!=='None')throw Error('Unsupported authentication');
 let body;
 if(operation.body!==undefined){if(operation.method!=='POST')throw Error('Body requires POST');body=JSON.stringify(operation.body);if(!body||Buffer.byteLength(body)>65536)throw Error('Request body too large');headers.set('Content-Type','application/json')}
 return {url,options:{method:operation.method,headers,body,redirect:'error'}};
}
// Preparation only: DNS pinning, bounded transport, quotas and authorization must precede network execution.
