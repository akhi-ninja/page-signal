import {getAuthRuntime} from './auth.mjs';
import {createJobStore,validateJobPages} from './document-jobs.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function documentJobs(request,env=process.env,dependencies={}){
 if(env.PAGESIGNAL_DURABLE_JOBS!=='true'||typeof env.CRON_SECRET!=='string'||env.CRON_SECRET.length<32)return json({error:'Durable jobs are not enabled.'},503);
 const runtime=(dependencies.getRuntime||getAuthRuntime)(env);if(!runtime)return json({error:'Account service unavailable'},503);
 const url=new URL(request.url),mutation=request.method!=='GET';
 if(url.origin!==runtime.origin||(mutation&&request.headers.get('origin')!==runtime.origin)||(!mutation&&request.headers.has('origin')&&request.headers.get('origin')!==runtime.origin))return json({error:'Invalid origin'},403);
 if(!['GET','POST','DELETE'].includes(request.method))return json({error:'Method not allowed'},405);
 try{
  const session=await runtime.auth.api.getSession({headers:request.headers});if(!session?.user)return json({error:'Sign in required'},401);if(!session.user.emailVerified)return json({error:'Verified email required'},403);
  const store=dependencies.store||createJobStore(runtime.pool,env.BETTER_AUTH_SECRET);const owner=session.user.id,id=url.searchParams.get('id');
  if(id&&!/^[a-f0-9-]{36}$/i.test(id))return json({error:'Invalid job ID'},400);
  if(request.method==='GET'){if(!id)return json({error:'Job ID required'},400);const job=await store.read(id,owner);return job?json(job):json({error:'Job not found'},404);}
  if(request.method==='DELETE'){if(!id)return json({error:'Job ID required'},400);return await store.delete(id,owner)?json({deleted:true}):json({error:'Job not found'},404);}
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required'},415);
  let bytes=0;const chunks=[];if(request.body)for await(const chunk of request.body){bytes+=chunk.length;if(bytes>4000000)return json({error:'Job submission exceeds 4 MB. Submit a smaller rendered document.'},413);chunks.push(chunk);}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return json({error:'Invalid JSON'},400);}
  if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Invalid request'},400);
  if(id){if(!['retry','cancel','approve'].includes(body.action))return json({error:'Invalid action'},400);let job;try{job=await store.action(id,owner,body.action,body.pages);}catch{return json({error:'Job action is invalid for the current state or supplied review.'},409);}
   if(!job)return json({error:'Job not found'},404);
   if(body.action==='retry'&&job.status==='queued')await dependencies.enqueue(id,{idempotencyKey:`${id}:manual:${crypto.randomUUID()}`});
   return json(job);
  }
  try{validateJobPages(body.pages);if(typeof body.idempotency_key!=='string'||!/^[-a-zA-Z0-9_]{8,128}$/.test(body.idempotency_key))throw Error();}catch{return json({error:'Provide 1–40 bounded JPEG/text pages and an 8–128 character idempotency key.'},400);}
  await store.prune();let created;try{created=await store.create(owner,body.pages,body.idempotency_key);}catch{return json({error:'Job capacity reached or idempotency key conflicts with an earlier submission.'},409);}
  // Queue sends contain only the opaque job ID. Retry the same submission if delivery fails.
  await dependencies.enqueue(created.id,{idempotencyKey:`${created.id}:start`});return json({id:created.id,status:'queued',created:created.created},202);
 }catch{return json({error:'Job service temporarily unavailable. Retry creation with the same idempotency key.'},503);}
}
