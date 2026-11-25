import test from 'node:test';
import assert from 'node:assert/strict';
import {
 configuredExtensionOrigin, issueExtensionToken, inspectExtensionToken,
 authorizeExtensionConnection, authorizedExtensionSession,
 extensionConnectionStatus, extensionPreflight, refreshExtensionConnection
} from '../lib/extension-auth.mjs';

const site='https://www.pagesignal.studio';
const origin='chrome-extension://'+'a'.repeat(32);
const env={PAGESIGNAL_CHROME_EXTENSION_ORIGIN:origin,BETTER_AUTH_SECRET:'x'.repeat(48)};
const challenge='b'.repeat(64);
const claims={userId:'account-1',sessionId:'session-1',origin,nonce:challenge};
const header=(token,extension=origin)=>new Headers({Origin:extension,Authorization:'Bearer '+token});
function runtime({signedIn=true,active=true,verified=true}={}) {
 return {origin:site,auth:{api:{getSession:async()=> signedIn
  ? {user:{id:claims.userId,emailVerified:verified},session:{id:claims.sessionId}}:null}},
 pool:{query:async(sql,values)=>{
   assert.match(sql,/FROM "session"/);
   assert.deepEqual(values,[claims.sessionId,claims.userId]);
   return {rows:active?[{id:claims.userId,verified}]:[]};
 }}};
}
test('exact published extension ID must be configured, never wildcards or other extensions',()=>{
 assert.equal(configuredExtensionOrigin({}),null);
 assert.equal(configuredExtensionOrigin({PAGESIGNAL_CHROME_EXTENSION_ORIGIN:'chrome-extension://*'}),null);
 assert.equal(configuredExtensionOrigin(env),origin);
 assert.equal(inspectExtensionToken(issueExtensionToken(claims,env).token,'chrome-extension://'+'c'.repeat(32),env),null);
});
test('signed extension capability is integrity-protected, scoped, expires, and is not an OAuth token',()=>{
 const now=Date.UTC(2026,10,25,18,0,0);
 const {token,expiresAt}=issueExtensionToken(claims,env,now);
 assert.equal(Date.parse(expiresAt),now+900000);
 assert.equal(inspectExtensionToken(token,origin,env,now+1000).sub,claims.userId);
 assert.equal(inspectExtensionToken(token+'x',origin,env,now),null);
 assert.equal(inspectExtensionToken(token,origin,env,now+3600000),null);
 assert.equal(inspectExtensionToken(token,origin,{...env,BETTER_AUTH_SECRET:'y'.repeat(48)},now),null);
 assert.equal(inspectExtensionToken(token,'chrome-extension://'+'c'.repeat(32),env,now),null);
});
test('extension status checks signed token AND live database session every time',async()=>{
 const {token}=issueExtensionToken(claims,env);
 const request=new Request(site+'/api/extension/status',{headers:header(token)});
 const getRuntime=()=>runtime();
 const allowed=await extensionConnectionStatus(request,env,{getRuntime});
 assert.equal(allowed.status,200);
 assert.equal(allowed.headers.get('access-control-allow-origin'),origin);
 assert.equal((await extensionConnectionStatus(request,env,{getRuntime:()=>runtime({active:false})})).status,401);
 assert.equal((await extensionConnectionStatus(request,env,{getRuntime:()=>runtime({verified:false})})).status,401);
 assert.equal((await extensionConnectionStatus(new Request(site+'/api/extension/status',{headers:header(token,'chrome-extension://'+'c'.repeat(32))}),env,{getRuntime})).status,403);
 assert.equal((await authorizedExtensionSession(new Request(site,{headers:header(token)}),env,runtime({active:false}))),null);
});
test('pairing requires same-origin POST, verified website session and approved extension ID',async()=>{
 const body={extensionId:'a'.repeat(32),challenge};
 const request=(from=site,payload=body)=>new Request(site+'/api/extension/authorize',{
  method:'POST',headers:{Origin:from,'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const getRuntime=()=>runtime();
 assert.equal((await authorizeExtensionConnection(request('https://attacker.example'),env,{getRuntime})).status,403);
 assert.equal((await authorizeExtensionConnection(request(site,{...body,extensionId:'c'.repeat(32)}),env,{getRuntime})).status,403);
 assert.equal((await authorizeExtensionConnection(request(),{BETTER_AUTH_SECRET:env.BETTER_AUTH_SECRET},{getRuntime})).status,503);
 assert.equal((await authorizeExtensionConnection(request(),env,{getRuntime:()=>runtime({signedIn:false})})).status,401);
 assert.equal((await authorizeExtensionConnection(request(),env,{getRuntime:()=>runtime({verified:false})})).status,401);
 const response=await authorizeExtensionConnection(request(),env,{getRuntime});
 assert.equal(response.status,200);
 const grant=await response.json();
 assert.equal(inspectExtensionToken(grant.token,origin,env).sid,claims.sessionId);
 assert.equal(response.headers.get('cache-control'),'no-store');
});
test('CORS preflight is exact-origin only with no wildcard',async()=>{
 const good=extensionPreflight(new Request(site+'/api/ai/extract',{method:'OPTIONS',headers:{
  Origin:origin,'Access-Control-Request-Method':'POST'
 }}),env);
 assert.equal(good.status,204);
 assert.equal(good.headers.get('access-control-allow-origin'),origin);
 const bad=extensionPreflight(new Request(site+'/api/ai/extract',{method:'OPTIONS',headers:{
  Origin:'chrome-extension://'+'c'.repeat(32),'Access-Control-Request-Method':'POST'
 }}),env);
 assert.equal(bad.status,403);
});

test('short-lived access tokens renew through a session-verified grant, never through cookies',async()=>{
 const grant=issueExtensionToken(claims,env,Date.now(),'refresh');
 const refresh=()=>new Request(site+'/api/extension/refresh',{
  method:'POST',headers:header(grant.token)
 });
 const success=await refreshExtensionConnection(refresh(),env,{getRuntime:()=>runtime()});
 assert.equal(success.status,200);
 assert.equal(inspectExtensionToken((await success.json()).token,origin,env).sub,claims.userId);
 assert.equal((await refreshExtensionConnection(refresh(),env,{getRuntime:()=>runtime({active:false})})).status,401);
 assert.equal((await extensionConnectionStatus(new Request(site+'/api/extension/status',{
  headers:header(grant.token)
 }),env,{getRuntime:()=>runtime()})).status,401);
 assert.equal((await refreshExtensionConnection(new Request(site+'/api/extension/refresh',{
  method:'POST',headers:header(issueExtensionToken(claims,env).token)
 }),env,{getRuntime:()=>runtime()})).status,401);
});
