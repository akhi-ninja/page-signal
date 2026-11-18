import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins/magic-link';
import { getMigrations } from 'better-auth/db/migration';
import { getAuthRuntime } from '../lib/auth.mjs';

test('real auth handler verifies a one-use email link, creates a verified session and revokes it on logout', async () => {
 const env={BETTER_AUTH_URL:'http://localhost:3000',BETTER_AUTH_SECRET:randomBytes(32).toString('base64url'),DATABASE_URL:'postgres://localhost/not-used',RESEND_API_KEY:'not-used',AUTH_EMAIL_FROM:'test@example.com'};
 const runtime=getAuthRuntime(env), database=new DatabaseSync(':memory:');let sent;
 const plugin=runtime.auth.options.plugins[0];
 const auth=betterAuth({...runtime.auth.options,database,plugins:[magicLink({...plugin.options,sendMagicLink:async data=>{sent=data;}})]});
 try {
  const { runMigrations }=await getMigrations(auth.options);await runMigrations();
  const send=await auth.handler(new Request('http://localhost:3000/api/auth/sign-in/magic-link',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({email:'example@example.com',callbackURL:'/'})}));
  assert.equal(send.status,200);assert.equal(sent.email,'example@example.com');assert(sent.url);
  const verify=await auth.handler(new Request(sent.url));assert.equal(verify.status,302);
  const cookie=verify.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');assert(cookie.includes('session_token='));
  const session=await auth.api.getSession({headers:new Headers({Cookie:cookie})});assert.equal(session.user.emailVerified,true);assert.equal(session.user.email,'example@example.com');
  const replay=await auth.handler(new Request(sent.url));assert.match(replay.headers.get('location'),/error=/);
  const logout=await auth.handler(new Request('http://localhost:3000/api/auth/sign-out',{method:'POST',headers:{Cookie:cookie,Origin:'http://localhost:3000','Content-Type':'application/json'},body:'{}'}));assert.equal(logout.status,200);
  assert.equal(await auth.api.getSession({headers:new Headers({Cookie:cookie})}),null);
 } finally {database.close();await runtime.pool.end();}
});
