import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { orchestratedExtract as extract } from './lib/orchestrated-extraction.mjs';
import { authConfiguration, handleAuth } from './lib/auth.mjs';
import { accountExtract, accountStatus } from './lib/account-api.mjs';
import { community } from './lib/community.mjs';

const accounts = process.env.PAGESIGNAL_AUTH_MODE === 'accounts';
const token = process.env.PAGESIGNAL_API_KEY;
if (!accounts && (!token || token.length < 24)) throw new Error('Set PAGESIGNAL_API_KEY to a random secret of at least 24 characters, or select PAGESIGNAL_AUTH_MODE=accounts.');
const assets = {
  '/releases':['web/releases.html','text/html'], '/releases/':['web/releases.html','text/html'],
  '/releases.html':['web/releases.html','text/html'], '/releases.css':['web/releases.css','text/css'], '/releases.js':['web/releases.js','text/javascript'],
  '/robots.txt':['web/robots.txt','text/plain'], '/sitemap.xml':['web/sitemap.xml','application/xml'],
  '/community':['web/community.html','text/html'], '/admin':['web/community.html','text/html'],
  '/community.js':['web/community.js','text/javascript'],
  '/document-quality.mjs':['web/document-quality.mjs','text/javascript'],
  '/document-viewer.mjs': ['web/document-viewer.mjs','text/javascript'],
  '/favicon.ico': ['web/favicon.ico','image/x-icon'],
  '/favicon-16x16.png': ['web/favicon-16x16.png','image/png'],
  '/favicon-32x32.png': ['web/favicon-32x32.png','image/png'],
  '/apple-touch-icon.png': ['web/apple-touch-icon.png','image/png'],
  '/android-chrome-192x192.png': ['web/android-chrome-192x192.png','image/png'],
  '/android-chrome-512x512.png': ['web/android-chrome-512x512.png','image/png'],
  '/pagesignal-icon-128.png': ['web/pagesignal-icon-128.png','image/png'],
  '/site.webmanifest': ['web/site.webmanifest','application/manifest+json'],
  '/': ['web/index.html','text/html'], '/docs': ['web/docs.html','text/html'],
  '/docs/': ['web/docs.html','text/html'], '/docs.html': ['web/docs.html','text/html'],
  '/privacy': ['web/privacy.html','text/html'], '/terms': ['web/terms.html','text/html'],
  '/contact': ['web/contact.html','text/html'], '/openapi.json': ['web/openapi.json','application/json'],
  '/ocr-loader.mjs': ['web/ocr-loader.mjs','text/javascript'],
  '/pagesignal-icon-84.webp': ['web/pagesignal-icon-84.webp','image/webp'],
  '/app.js': ['web/app.js','text/javascript'], '/account.js': ['web/account.js','text/javascript'],
  '/engine.js': ['web/engine.js','text/javascript'], '/style.css': ['web/style.css','text/css']
};
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
function authorized(request) {
  const actual=Buffer.from(request.headers.authorization||'');
  return ['Bearer '+token,'Basic '+Buffer.from('pagesignal:'+token).toString('base64')].some(value=>{
    const expected=Buffer.from(value);return actual.length===expected.length&&timingSafeEqual(actual,expected);
  });
}
async function webRequest(request, origin, maximum) {
  const chunks=[];let length=0;
  for await(const chunk of request){length+=chunk.length;if(length>maximum)throw new RangeError('Body too large');chunks.push(chunk);}
  const headers=new Headers();for(const [key,value] of Object.entries(request.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
  headers.set('x-pagesignal-client-ip',request.socket.remoteAddress||'127.0.0.1');
  if(!accounts)headers.set('Origin',origin);
  const method=request.method;
  return new Request(new URL(request.url,origin),{method,headers,body:['GET','HEAD'].includes(method)?undefined:Buffer.concat(chunks)});
}
async function send(response,result) {
  const headers=Object.fromEntries(result.headers);const cookies=result.headers.getSetCookie();if(cookies.length)headers['set-cookie']=cookies;
  response.writeHead(result.status,headers);response.end(Buffer.from(await result.arrayBuffer()));
}
let active=0;
createServer(async(request,response)=>{
 try{
  const path=new URL(request.url,'http://localhost').pathname;
  if(!accounts&&!authorized(request)){const result=json({error:'Sign in with the Community service credential.'},401);result.headers.set('WWW-Authenticate','Basic realm="PageSignal Community", charset="UTF-8"');return await send(response,result);}
  const origin=accounts?(authConfiguration(process.env)?.origin||'http://localhost:3000'):'https://pagesignal.internal';
  if(accounts&&(path==='/api/auth'||path.startsWith('/api/auth/')))return await send(response,await handleAuth(await webRequest(request,origin,64000)));
  if(accounts&&path==='/api/community')return await send(response,await community(await webRequest(request,origin,8192)));
  if(path==='/api/ai/status'&&request.method==='GET')return await send(response,accounts?await accountStatus(await webRequest(request,origin,0)):json({configured:Boolean(process.env.OPENAI_API_KEY),provider:'OpenAI',authRequired:false}));
  if(path==='/api/ai/extract'){
   if(request.method!=='POST')return await send(response,json({error:'Use POST.'},405));
   if(active>=3)return await send(response,json({error:'Processing capacity reached. Retry later.'},429));
   active++;try{
    const input=await webRequest(request,origin,4000000);
    return await send(response,accounts?await accountExtract(input):await extract(input,process.env));
   }finally{active--;}
  }
  const asset=assets[path];if(!asset||!['GET','HEAD'].includes(request.method))return await send(response,json({error:'Not found.'},404));
  response.writeHead(200,{'Content-Type':asset[1]+(asset[1].startsWith('image/')?'':'; charset=utf-8'),'X-Content-Type-Options':'nosniff'});
  response.end(request.method==='HEAD'?undefined:await readFile(new URL(asset[0],import.meta.url)));
 }catch(error){if(!response.headersSent)await send(response,json({error:error instanceof RangeError?'Request body is too large.':'The request could not be completed.'},error instanceof RangeError?413:500));else response.end();}
}).listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1');
