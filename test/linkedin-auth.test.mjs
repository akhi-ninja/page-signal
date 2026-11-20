import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {JSDOM} from 'jsdom';
import {betterAuth} from 'better-auth';
import {getMigrations} from 'better-auth/db/migration';
import {authConfiguration,getAuthRuntime} from '../lib/auth.mjs';

const config=()=>({BETTER_AUTH_URL:'http://localhost:3000',DATABASE_URL:'postgres://localhost/not-used',BETTER_AUTH_SECRET:randomBytes(32).toString('base64url'),GITHUB_CLIENT_ID:'github-client',GITHUB_CLIENT_SECRET:'github-secret',LINKED_CLIENT_ID:'legacy-client',LINKEDIN_CLIENT_SECRET:'linkedin-secret'});

test('LinkedIn supports canonical and legacy IDs, requires a secret, and allows linking only with verified matching ownership',async()=>{
 const env=config();
 assert.equal(authConfiguration(env).providers.linkedin,true);
 assert.equal(authConfiguration({...env,LINKEDIN_CLIENT_SECRET:''}).providers.linkedin,false);
 assert.equal(authConfiguration({...env,LINKED_CLIENT_ID:''}).providers.linkedin,false);
 const runtime=getAuthRuntime({...env,LINKEDIN_CLIENT_ID:'canonical-client'});
 try{
  assert.equal(runtime.auth.options.socialProviders.linkedin.clientId,'canonical-client');
  assert.equal(runtime.auth.options.account.accountLinking.enabled,true);
  assert.equal(runtime.auth.options.account.accountLinking.disableImplicitLinking,false);
  assert.equal(runtime.auth.options.account.accountLinking.requireLocalEmailVerified,true);
  assert.deepEqual(runtime.auth.options.account.accountLinking.trustedProviders,[]);
  assert.equal(runtime.auth.options.account.accountLinking.allowDifferentEmails,false);
  assert.deepEqual(runtime.auth.options.trustedOrigins,['http://localhost:3000']);
  assert.deepEqual(runtime.auth.options.socialProviders.linkedin.scope,['openid','profile','email']);
 }finally{await runtime.pool.end();}
});

test('real auth handler starts both OAuth providers with state and the correct callback; rejects foreign return URL',async()=>{
 const runtime=getAuthRuntime(config()),database=new DatabaseSync(':memory:');
 const auth=betterAuth({...runtime.auth.options,database});
 try{
  const {runMigrations}=await getMigrations(auth.options);await runMigrations();
  const start=(provider,callbackURL='/')=>auth.handler(new Request('http://localhost:3000/api/auth/sign-in/social',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({provider,callbackURL,errorCallbackURL:'/?signin=failed'})}));
  for(const provider of ['github','linkedin']){
   const response=await start(provider);assert.equal(response.status,200);
   const data=await response.json(),url=new URL(data.url);
   assert.equal(url.hostname,provider==='linkedin'?'www.linkedin.com':'github.com');
   assert.equal(url.searchParams.get('redirect_uri'),'http://localhost:3000/api/auth/callback/'+provider);
   assert(url.searchParams.get('state'));
   if(provider==='linkedin'){
    assert.equal(url.searchParams.get('client_id'),'legacy-client');
    for(const scope of ['openid','profile','email'])assert(url.searchParams.get('scope').split(' ').includes(scope));
   }
   assert(!data.url.includes('linkedin-secret'));
  }
  assert.equal((await start('linkedin','https://attacker.example/')).status,403);
  const invalid=await auth.handler(new Request('http://localhost:3000/api/auth/callback/linkedin?code=forged&state=forged'));
  assert.notEqual(invalid.status,200);assert(!invalid.headers.getSetCookie().some(cookie=>/session_token=/.test(cookie)));
 }finally{database.close();await runtime.pool.end();}
});

function accountUI(providers){
 const html=readFileSync('web/index.html','utf8'),script=readFileSync('web/account.js','utf8');
 const dom=new JSDOM(html,{url:'https://www.pagesignal.studio/',runScripts:'outside-only'});
 const {window}=dom;let calls=[];
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 window.fetch=async(path,options)=>{calls.push({path,options});if(path==='/api/ai/status')return {ok:true,json:async()=>({authRequired:true,authConfigured:true,user:null,providers})};return {ok:false,json:async()=>({error:'mock failure'})};};
 window.eval(script);return {dom,window,calls};
}
test('workspace reveals configured LinkedIn, preserves GitHub, prompts before upload and sends LinkedIn provider',async()=>{
 const {dom,window,calls}=accountUI({github:true,linkedin:true});
 try{
  await window.PageSignalAccount.ready;
  assert.equal(window.document.getElementById('login-linkedin').hidden,false);
  assert.equal(window.document.getElementById('login-linkedin').disabled,false);
  assert.equal(await window.PageSignalAccount.ensureSignedIn(),false);
  assert.equal(window.document.getElementById('account-dialog').open,true);
  window.document.getElementById('login-linkedin').click();
  assert.equal(window.document.getElementById('login-github').disabled,true);
  await new Promise(r=>setTimeout(r,0));
  const request=calls.find(c=>c.path==='/api/auth/sign-in/social');assert.equal(JSON.parse(request.options.body).provider,'linkedin');
  assert.equal(JSON.parse(request.options.body).callbackURL,'/');
  assert.match(window.document.getElementById('account-message').textContent,/original sign-in provider/);
  assert.equal(window.document.getElementById('login-github').disabled,false);
 }finally{dom.window.close();}
});
test('unconfigured LinkedIn remains hidden and unavailable while GitHub works',async()=>{
 const {dom,window}=accountUI({github:true,linkedin:false});
 try{await window.PageSignalAccount.ready;assert.equal(window.document.getElementById('login-linkedin').hidden,true);assert.equal(window.document.getElementById('login-linkedin').disabled,true);assert.equal(window.document.getElementById('login-github').disabled,false);}finally{dom.window.close();}
});

test('account_not_linked explains how to connect providers instead of suggesting an expired link',async()=>{
 const html=readFileSync('web/index.html','utf8'),script=readFileSync('web/account.js','utf8');
 const dom=new JSDOM(html,{url:'https://www.pagesignal.studio/?signin=failed&error=account_not_linked',runScripts:'outside-only'}),{window}=dom;
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 window.fetch=async()=>({ok:true,json:async()=>({authRequired:true,authConfigured:true,user:null,providers:{github:true,linkedin:true}})});
 try{window.eval(script);await window.PageSignalAccount.ready;assert.match(window.document.getElementById('account-message').textContent,/same verified email/);assert.equal(window.document.getElementById('account-dialog').open,true);assert.equal(window.location.search,'');}finally{window.close();}
});

test('successful authentication closes the sign-in dialog and exposes explicit connection controls',async()=>{
 const {dom,window}=accountUI({github:true,linkedin:true});
 try{
  await window.PageSignalAccount.ready;await window.PageSignalAccount.ensureSignedIn();
  const calls=[];window.fetch=async(path,options)=>{calls.push({path,options});return {ok:true,json:async()=>({authRequired:true,authConfigured:true,user:{email:'person@example.com'},providers:{github:true,linkedin:true}})};};
  await window.PageSignalAccount.refresh();assert.equal(window.document.getElementById('account-dialog').open,false);assert.equal(window.document.getElementById('account-connections').hidden,false);
  window.document.getElementById('connect-linkedin').click();await new Promise(r=>setTimeout(r,0));
  const call=calls.find(c=>c.path==='/api/auth/link-social');assert.equal(JSON.parse(call.options.body).provider,'linkedin');assert.equal(call.options.credentials,'same-origin');
 }finally{window.close();}
});

test('OAuth sign-in links verified matching emails and explicit linking rejects different or unverified emails',async()=>{
 const {magicLink}=await import('better-auth/plugins/magic-link');
 const runtime=getAuthRuntime(config()),database=new DatabaseSync(':memory:');let sent;
 const auth=betterAuth({...runtime.auth.options,database,plugins:[magicLink({sendMagicLink:async value=>{sent=value;}})]});
 const base='http://localhost:3000',headers={Origin:base,'Content-Type':'application/json','x-pagesignal-client-ip':'127.0.0.1'};
 const cookieJar=new Map();const cookies=()=>[...cookieJar].map(([k,v])=>k+'='+v).join('; ');
 const save=response=>{for(const raw of response.headers.getSetCookie()){const first=raw.split(';')[0],at=first.indexOf('=');cookieJar.set(first.slice(0,at),first.slice(at+1));}};
 const post=(path,body,cookie=cookies())=>auth.handler(new Request(base+'/api/auth/'+path,{method:'POST',headers:{...headers,Cookie:cookie},body:JSON.stringify(body)}));
 try{
  const {runMigrations}=await getMigrations(auth.options);await runMigrations();
  await post('sign-in/magic-link',{email:'owner@example.com',callbackURL:'/'});save(await auth.handler(new Request(sent.url)));
  const session=await auth.api.getSession({headers:new Headers({Cookie:cookies()})});assert(session);
  const context=await auth.$context,provider=context.socialProviders.find(p=>p.id==='linkedin');let email='owner@example.com',verified=true;
  provider.validateAuthorizationCode=async()=>({accessToken:'synthetic-token',scopes:['openid','email','profile']});
  provider.getUserInfo=async()=>({user:{name:'Owner',email,emailVerified:verified},data:{sub:'linkedin-synthetic-owner'}});
  const callback=async response=>{save(response);const data=await response.json(),state=new URL(data.url).searchParams.get('state');return auth.handler(new Request(base+'/api/auth/callback/linkedin?code=synthetic&state='+encodeURIComponent(state),{headers:{Cookie:cookies()}}));};
  const anonymous=await post('link-social',{provider:'linkedin',callbackURL:'/'},'');assert.equal(anonymous.status,401);
  const implicit=await callback(await post('sign-in/social',{provider:'linkedin',callbackURL:'/',errorCallbackURL:'/?signin=failed'},''));assert(!implicit.headers.get('location').includes('error='));
  email='different@example.com';let result=await callback(await post('link-social',{provider:'linkedin',callbackURL:'/',errorCallbackURL:'/?signin=failed'}));assert.match(result.headers.get('location'),/email_does_not_match/);
  email='owner@example.com';verified=false;result=await callback(await post('link-social',{provider:'linkedin',callbackURL:'/',errorCallbackURL:'/?signin=failed'}));assert.match(result.headers.get('location'),/unable_to_link_account/);
  verified=true;result=await callback(await post('link-social',{provider:'linkedin',callbackURL:'/',errorCallbackURL:'/?signin=failed'}));assert.equal(new URL(result.headers.get('location'),base).pathname,'/');assert(!result.headers.get('location').includes('error='));
  const accounts=await auth.api.listUserAccounts({headers:new Headers({Cookie:cookies()})});assert.equal(accounts.filter(a=>a.providerId==='linkedin').length,1);assert.equal(accounts.find(a=>a.providerId==='linkedin').userId,session.user.id);
  assert.equal((await auth.api.getSession({headers:new Headers({Cookie:cookies()})})).user.id,session.user.id);
  // Once explicitly linked, ordinary LinkedIn login resolves to the existing user.
  const returning=await callback(await post('sign-in/social',{provider:'linkedin',callbackURL:'/',errorCallbackURL:'/?signin=failed'},''));save(returning);
  assert(!returning.headers.get('location').includes('error='));assert.equal((await auth.api.getSession({headers:new Headers({Cookie:cookies()})})).user.id,session.user.id);
 }finally{database.close();await runtime.pool.end();}
});

for(const scenario of [
 {name:'both emails verified',localVerified:true,providerVerified:true,linked:true},
 {name:'unverified incoming email',localVerified:true,providerVerified:false,linked:false},
 {name:'missing provider verification',localVerified:true,providerVerified:undefined,linked:false},
 {name:'unverified existing account',localVerified:false,providerVerified:true,linked:false}
]) test('automatic existing-account linking: '+scenario.name,async()=>{
 const runtime=getAuthRuntime(config()),database=new DatabaseSync(':memory:');const auth=betterAuth({...runtime.auth.options,database});
 const base='http://localhost:3000';
 try{
  const {runMigrations}=await getMigrations(auth.options);await runMigrations();const context=await auth.$context;
  const user=await context.internalAdapter.createUser({name:'Existing owner',email:'owner@example.com',emailVerified:scenario.localVerified});
  await context.internalAdapter.createAccount({userId:user.id,providerId:'github',accountId:'original-github-owner'});
  const provider=context.socialProviders.find(p=>p.id==='linkedin');
  provider.validateAuthorizationCode=async()=>({accessToken:'synthetic-token',scopes:['openid','email','profile']});
  provider.getUserInfo=async()=>({user:{name:'LinkedIn owner',email:'owner@example.com',emailVerified:scenario.providerVerified},data:{sub:'linkedin-owner'}});
  const start=await auth.handler(new Request(base+'/api/auth/sign-in/social',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','x-pagesignal-client-ip':'127.0.0.1'},body:JSON.stringify({provider:'linkedin',callbackURL:'/',errorCallbackURL:'/?signin=failed'})}));
  const cookie=start.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),url=new URL((await start.json()).url);
  const result=await auth.handler(new Request(base+'/api/auth/callback/linkedin?code=synthetic&state='+encodeURIComponent(url.searchParams.get('state')),{headers:{Cookie:cookie}}));
  const accounts=database.prepare('SELECT "userId", "providerId" FROM account').all();
  assert.equal(database.prepare('SELECT count(*) AS count FROM user').get().count,1);
  assert(accounts.some(a=>a.providerId==='github' && a.userId===user.id));
  assert.equal(accounts.filter(a=>a.providerId==='linkedin').length,scenario.linked?1:0);
  if(scenario.linked){
   assert(!result.headers.get('location').includes('error='));
   const sessionCookie=result.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
   const session=await auth.api.getSession({headers:new Headers({Cookie:sessionCookie})});assert.equal(session.user.id,user.id);
   assert(accounts.every(a=>a.userId===user.id));
  }else{
   assert.match(result.headers.get('location'),/account_not_linked/);
   assert(!result.headers.getSetCookie().some(c=>/session_token=/.test(c)));
  }
 }finally{database.close();await runtime.pool.end();}
});

test('stale failure URL cannot keep the dialog open when a valid session exists',async()=>{
 const dom=new JSDOM(readFileSync('web/index.html','utf8'),{url:'https://www.pagesignal.studio/?signin=failed&error=account_not_linked',runScripts:'outside-only'}),{window}=dom;
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 window.fetch=async()=>({ok:true,json:async()=>({authRequired:true,authConfigured:true,user:{email:'owner@example.com'},providers:{github:true,linkedin:true}})});
 try{window.eval(readFileSync('web/account.js','utf8'));await window.PageSignalAccount.ready;await Promise.resolve();assert.equal(window.document.getElementById('account-dialog').open,false);assert.equal(window.document.getElementById('account-sign-in').hidden,true);assert.match(window.document.getElementById('account-button').textContent,/Account/);}finally{window.close();}
});
