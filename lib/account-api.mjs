import {observeTraffic} from './api-traffic.mjs';
import { getAuthRuntime, requestLimits } from './auth.mjs';
import { reserveAiRequest, readUsage } from './usage.mjs';
import { orchestratedExtract } from './orchestrated-extraction.mjs';
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

export async function accountStatus(request, env = process.env, dependencies = {}) {
  const runtime = (dependencies.getRuntime || getAuthRuntime)(env);
  const base = { configured: Boolean(env.OPENAI_API_KEY), authRequired: true, authConfigured: Boolean(runtime),
    providers: runtime?.providers || { github: false, linkedin: false, email: false } };
  if (!runtime) return json({ ...base, user: null });
  try {
    const session = await runtime.auth.api.getSession({ headers: request.headers });
    if (!session?.user) return json({ ...base, user: null });
    const usage = await (dependencies.readUsage || readUsage)(runtime.pool, session.user.id, requestLimits(env));
    return json({ ...base, user: { name: session.user.name, email: session.user.email }, usage });
  } catch { return json({ ...base, user: null, error: 'Account service is temporarily unavailable.' }, 503); }
}
async function accountExtractImpl(request, env = process.env, dependencies = {}) {
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const runtime = (dependencies.getRuntime || getAuthRuntime)(env);
  if (!runtime) return json({ error: 'Account sign-in is not configured yet. AI processing is unavailable.' }, 503);
  const origin = request.headers.get('origin');
  const extensionOrigin = env.PAGESIGNAL_CHROME_EXTENSION_ORIGIN?.trim();
  const trustedExtension = /^chrome-extension:\/\/[a-p]{32}$/.test(extensionOrigin || '') && origin === extensionOrigin;
  if ((origin !== runtime.origin && !trustedExtension) || new URL(request.url).origin !== runtime.origin ||
      !request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Invalid request origin or content type.' }, 403);
  if (!env.OPENAI_API_KEY) return json({ error: 'AI processing is not configured.' }, 503);
  try {
    const session = await runtime.auth.api.getSession({ headers: request.headers });
    if (!session?.user) return json({ error: 'Sign in to use AI extraction and document chat.', code: 'sign_in_required' }, 401);
    if (!session.user.emailVerified) return json({ error: 'Your sign-in provider must supply a verified email before AI processing. Verify your email with that provider, then sign out and sign in again. If LinkedIn does not supply a verified email, use GitHub with a verified email. Existing accounts must use their original provider.' }, 403);
    dependencies.onAuthorized?.(session.user.id);
    // Read actual bytes rather than trusting Content-Length.
    let length = 0; const chunks = [];
    if (request.body) for await (const chunk of request.body) {
      length += chunk.length;
      if (length > 4000000) return json({ error: 'The request exceeds 4 MB.' }, 413);
      chunks.push(chunk);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return json({ error: 'Invalid JSON body.' }, 400); }
    if (!body || typeof body !== 'object') return json({ error: 'Invalid request body.' }, 400);
    if (body.operation === 'document_query') {
      if (!['fields','chat'].includes(body.mode) || typeof body.question !== 'string' || !body.question.trim() || body.question.length > 2000 ||
          typeof body.context !== 'string' || body.context.length > 6000 || !Array.isArray(body.pages) || !body.pages.length || body.pages.length > 40 ||
          body.pages.some(p => !p || !Number.isInteger(p.page) || p.page < 1 || p.page > 40 || typeof p.text !== 'string') ||
          new Set(body.pages.map(p => p.page)).size !== body.pages.length || !body.pages.some(p => p.text.trim())) return json({ error: 'Invalid document question or page text.' }, 400);
      if (body.pages.reduce((sum,p) => sum + p.text.length, 0) > 160000) return json({ error: 'The document text is too large for one question.' }, 413);
    } else if (typeof body.image !== 'string' || body.image.length > 3800000 || !/^data:image\/jpeg;base64,[a-z0-9+/]+=*$/i.test(body.image) ||
               typeof body.text !== 'string' || body.text.length > 20000) return json({ error: 'Invalid page image or OCR text.' }, 400);
    const reservation = await (dependencies.reserve || reserveAiRequest)(runtime.pool, session.user.id, requestLimits(env));
    if (!reservation.allowed) return json({ error: reservation.reason, code: 'usage_limit' }, 429, { 'Retry-After': '60' });
    const response = await (dependencies.extract || orchestratedExtract)(new Request(request.url, {
      method: 'POST', headers: { Origin: runtime.origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal:request.signal
    }), env, {reserveAdditional:async()=>{
      const extra=await (dependencies.reserve || reserveAiRequest)(runtime.pool,session.user.id,requestLimits(env));
      if(extra.allowed)reservation.remaining=extra.remaining;
      return extra.allowed;
    }});
    response.headers.set('X-PageSignal-Requests-Remaining', String(reservation.remaining));
    return response;
  } catch { return json({ error: 'Account service is temporarily unavailable. No AI request was started if authorization or quota checks failed.' }, 503); }
}

export async function accountExtract(request,env=process.env,dependencies={}){
 const getRuntime=dependencies.getRuntime||getAuthRuntime;
 return observeTraffic(request,env,{...dependencies,getRuntime},'/api/ai/extract',onAuthorized=>accountExtractImpl(request,env,{...dependencies,onAuthorized}));
}
