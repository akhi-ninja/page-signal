import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getAuthRuntime } from './auth.mjs';

// A signed, origin-scoped capability, never the PageSignal site session cookie.
const accessTtlSeconds = 15 * 60;
const refreshTtlSeconds = 7 * 24 * 60 * 60;
const tokenPrefix = 'psx1';
const noStore = { 'Cache-Control': 'no-store' };
const respond = (value,status=200,headers={}) => Response.json(value,{status,headers:{...noStore,...headers}});
export function configuredExtensionOrigin(env) {
 const value = env.PAGESIGNAL_CHROME_EXTENSION_ORIGIN?.trim() || '';
 return /^chrome-extension:\/\/[a-p]{32}$/.test(value) ? value : null;
}
export function extensionCors(request,env) {
 const origin=configuredExtensionOrigin(env);
 if (!origin || request.headers.get('origin') !== origin) return null;
 return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Vary': 'Origin' };
}
export function extensionPreflight(request,env) {
 const cors=extensionCors(request,env);
 if (!cors || request.headers.get('access-control-request-method') && !['GET','POST'].includes(request.headers.get('access-control-request-method'))) {
  return respond({error:'This extension is not authorized.'},403);
 }
 return new Response(null,{status:204,headers:{...noStore,...cors,'Access-Control-Max-Age':'600'}});
}
function signingKey(env) {
 if (typeof env.BETTER_AUTH_SECRET !== 'string' || env.BETTER_AUTH_SECRET.length < 32) throw new Error('Extension authentication unavailable.');
 return createHmac('sha256',env.BETTER_AUTH_SECRET).update('pagesignal-extension-auth-v1').digest();
}
function signature(payload,env) {
 return createHmac('sha256',signingKey(env)).update(tokenPrefix+'.'+payload).digest('base64url');
}
export function issueExtensionToken({userId,sessionId,origin,nonce},env,now=Date.now(),type='access') {
 if (origin!==configuredExtensionOrigin(env) || !userId || !sessionId ||
     !/^[a-f0-9]{64}$/.test(nonce) || !Number.isSafeInteger(now)) throw new Error('Invalid extension authorization.');
 if(!['access','refresh'].includes(type))throw new Error('Invalid token type.');
 const ttl=type==='access'?accessTtlSeconds:refreshTtlSeconds;
 const payload=Buffer.from(JSON.stringify({v:1,sub:userId,sid:sessionId,aud:origin,
  nonce,type,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+ttl})).toString('base64url');
 return { token: tokenPrefix+'.'+payload+'.'+signature(payload,env), expiresAt:new Date(now+ttl*1000).toISOString() };
}
export function inspectExtensionToken(token,origin,env,now=Date.now(),type='access') {
 try {
  if (origin!==configuredExtensionOrigin(env) || typeof token!=='string' || token.length>2048) return null;
  const pieces=token.split('.');
  if (pieces.length!==3 || pieces[0]!==tokenPrefix ||
     !/^[A-Za-z0-9_-]{20,1800}$/.test(pieces[1]) || !/^[A-Za-z0-9_-]{43}$/.test(pieces[2])) return null;
  const actual=Buffer.from(pieces[2],'base64url'),expected=Buffer.from(signature(pieces[1],env),'base64url');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
  const value=JSON.parse(Buffer.from(pieces[1],'base64url').toString('utf8'));
  const seconds=Math.floor(now/1000);
  if(value.v!==1||value.aud!==origin||!Number.isInteger(value.iat)||!Number.isInteger(value.exp)||
     value.type!==type||value.iat>seconds+30||value.exp<=seconds||
     value.exp-value.iat!==(type==='refresh'?refreshTtlSeconds:accessTtlSeconds)||
     typeof value.sub!=='string'||!value.sub||value.sub.length>256||
     typeof value.sid!=='string'||!value.sid||value.sid.length>256||
     !/^[a-f0-9]{64}$/.test(value.nonce)) return null;
  return value;
 }catch{return null}
}
export async function authorizedExtensionSession(request,env,runtime,type='access') {
 const origin=request.headers.get('origin');
 const header=request.headers.get('authorization')||'';
 if(!header.startsWith('Bearer '))return null;
 const claims=inspectExtensionToken(header.slice(7),origin,env,Date.now(),type);
 if(!claims)return null;
 // Recheck Better Auth's persisted session on every request so sign-out and revocation
 // immediately invalidate extension capabilities. No session cookie crosses origins.
 const found=await runtime.pool.query(
  'SELECT s."userId" AS id, u."emailVerified" AS verified FROM "session" s JOIN "user" u ON u.id=s."userId" WHERE s.id=$1 AND s."userId"=$2 AND s."expiresAt">now()',
  [claims.sid,claims.sub]);
 const row=found.rows?.[0];
 if(!row || row.verified!==true)return null;
 return {session:{id:claims.sid},user:{id:claims.sub,emailVerified:true}};
}
export async function authorizeExtensionConnection(request,env=process.env,deps={}) {
 if(request.method!=='POST')return respond({error:'Use POST.'},405);
 const runtime=(deps.getRuntime||getAuthRuntime)(env);
 const origin=configuredExtensionOrigin(env);
 if(!runtime||!origin)return respond({error:'Chrome extension connection is not configured.'},503);
 if(new URL(request.url).origin!==runtime.origin||request.headers.get('origin')!==runtime.origin||
    !/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return respond({error:'Invalid request origin or content type.'},403);
 try{
  const bodyText=await request.text();
  if(bodyText.length>512)return respond({error:'Invalid connection request.'},413);
  const body=JSON.parse(bodyText);
  const extension='chrome-extension://'+body.extensionId;
  if(extension!==origin || !/^[a-f0-9]{64}$/.test(body.challenge))return respond({error:'This Chrome extension is not approved.'},403);
  const session=await runtime.auth.api.getSession({headers:request.headers});
  if(!session?.user?.id||!session.user.emailVerified||!session.session?.id)
   return respond({error:'Sign in with a verified PageSignal account before connecting.',code:'sign_in_required'},401);
  const values={userId:session.user.id,sessionId:session.session.id,origin,nonce:body.challenge};
  const access=issueExtensionToken(values,env);
  const refresh=issueExtensionToken(values,env,Date.now(),'refresh');
  return respond({token:access.token,expiresAt:access.expiresAt,refreshToken:refresh.token,refreshExpiresAt:refresh.expiresAt});
 }catch{return respond({error:'Could not authorize the extension.'},400)}
}
export async function extensionConnectionStatus(request,env=process.env,deps={}) {
 if(request.method==='OPTIONS')return extensionPreflight(request,env);
 const cors=extensionCors(request,env);
 if(!cors || new URL(request.url).origin!==(deps.getRuntime||getAuthRuntime)(env)?.origin) return respond({error:'Extension origin is not approved.'},403);
 if(request.method!=='GET')return respond({error:'Use GET.'},405,cors);
 try {
  const runtime=(deps.getRuntime||getAuthRuntime)(env);
  if(!runtime)return respond({error:'Account service unavailable.'},503,cors);
  const session=await authorizedExtensionSession(request,env,runtime);
  if(!session)return respond({error:'Connect your PageSignal account to the extension.',code:'sign_in_required'},401,cors);
  return respond({user:{connected:true},authenticated:true},200,cors);
 }catch{return respond({error:'Account service unavailable.'},503,cors)}
}

export async function refreshExtensionConnection(request,env=process.env,deps={}) {
 if(request.method==='OPTIONS')return extensionPreflight(request,env);
 const cors=extensionCors(request,env);
 if(!cors)return respond({error:'Extension origin is not approved.'},403);
 if(request.method!=='POST')return respond({error:'Use POST.'},405,cors);
 const runtime=(deps.getRuntime||getAuthRuntime)(env);
 if(!runtime||new URL(request.url).origin!==runtime.origin)return respond({error:'Account service unavailable.'},503,cors);
 try{
  const session=await authorizedExtensionSession(request,env,runtime,'refresh');
  if(!session)return respond({error:'Your PageSignal connection has expired. Connect again.',code:'sign_in_required'},401,cors);
  const claims=inspectExtensionToken(request.headers.get('authorization').slice(7),request.headers.get('origin'),env,Date.now(),'refresh');
  const access=issueExtensionToken({userId:claims.sub,sessionId:claims.sid,origin:claims.aud,nonce:claims.nonce},env);
  return respond(access,200,cors);
 }catch{return respond({error:'Account service unavailable.'},503,cors)}
}
