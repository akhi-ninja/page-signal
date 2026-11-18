import { getAuthRuntime } from './auth.mjs';
export const communitySchema=`CREATE TABLE IF NOT EXISTS pagesignal_community (
 user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 organization text NOT NULL, use_case text NOT NULL, integration text NOT NULL,
 contact_opt_in boolean NOT NULL DEFAULT false,
 consented_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
)`;
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
export async function isAdmin(runtime,userId,env){
 const ids=(env.PAGESIGNAL_ADMIN_GITHUB_IDS||'').split(',').map(s=>s.trim()).filter(s=>/^\d+$/.test(s));
 if(!ids.length)return false;
 const result=await runtime.pool.query('SELECT 1 FROM account WHERE "userId"=$1 AND "providerId"=\'github\' AND "accountId"=ANY($2::text[]) LIMIT 1',[userId,ids]);
 return result.rows.length>0;
}
async function body(request){
 let size=0;const chunks=[];
 if(request.body)for await(const chunk of request.body){size+=chunk.length;if(size>8192)throw new RangeError();chunks.push(chunk);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function community(request,env=process.env,dependencies={}){
 const runtime=(dependencies.getRuntime||getAuthRuntime)(env);
 if(!runtime)return reply({error:'Account service is not configured.'},503);
 const url=new URL(request.url), admin=url.searchParams.get('view')==='admin';
 if(!['GET','PUT','DELETE'].includes(request.method)||admin&&request.method!=='GET')return reply({error:'Method not allowed.'},405);
 if(request.method!=='GET'&&(url.origin!==runtime.origin||request.headers.get('origin')!==runtime.origin))return reply({error:'Invalid origin.'},403);
 try{
  const session=await runtime.auth.api.getSession({headers:request.headers});
  if(!session?.user)return reply({error:'Sign in with GitHub to continue.'},401);
  if(!session.user.emailVerified)return reply({error:'Verify your GitHub email before continuing.'},403);
  const userId=session.user.id;
  if(admin){
   if(!await isAdmin(runtime,userId,env))return reply({error:'Administrator access required.'},403);
   const page=Number(url.searchParams.get('page')||1);
   if(!Number.isInteger(page)||page<1||page>10000)return reply({error:'Invalid page.'},400);
   await runtime.pool.query(communitySchema);
   const summary=await runtime.pool.query(`SELECT (SELECT count(*)::int FROM "user") AS accounts,
    (SELECT count(*)::int FROM pagesignal_community) AS registrations,
    (SELECT coalesce(sum(requests),0)::int FROM pagesignal_usage WHERE subject LIKE 'account:%' AND day>=(now() AT TIME ZONE 'UTC')::date-29) AS requests_30d`);
   const users=await runtime.pool.query(`SELECT u.id,u.name,u.email,u."createdAt" AS joined_at,
    c.organization,c.use_case,c.integration,c.contact_opt_in,c.consented_at,
    coalesce(a.requests_30d,0)::int AS requests_30d,coalesce(a.requests_today,0)::int AS requests_today,a.last_ai_day::text AS last_ai_day
    FROM "user" u LEFT JOIN pagesignal_community c ON c.user_id=u.id
    LEFT JOIN (SELECT substring(subject from 9) AS user_id,sum(requests) AS requests_30d,
     sum(CASE WHEN day=(now() AT TIME ZONE 'UTC')::date THEN requests ELSE 0 END) AS requests_today,max(day) AS last_ai_day
     FROM pagesignal_usage WHERE subject LIKE 'account:%' AND day>=(now() AT TIME ZONE 'UTC')::date-29 GROUP BY subject) a ON a.user_id=u.id
    ORDER BY u."createdAt" DESC,u.id LIMIT 50 OFFSET $1`,[(page-1)*50]);
   const daily=await runtime.pool.query(`SELECT day::text AS day,sum(requests)::int AS requests FROM pagesignal_usage
    WHERE subject LIKE 'account:%' AND day>=(now() AT TIME ZONE 'UTC')::date-29 GROUP BY day ORDER BY day`);
   return reply({summary:summary.rows[0],users:users.rows,daily:daily.rows,page,pageSize:50,unit:'AI request attempts',timezone:'UTC'});
  }
  if(request.method==='GET'){
   await runtime.pool.query(communitySchema);
   const profile=await runtime.pool.query('SELECT organization,use_case,integration,contact_opt_in,consented_at FROM pagesignal_community WHERE user_id=$1',[userId]);
   return reply({profile:profile.rows[0]||null,isAdmin:await isAdmin(runtime,userId,env),user:{name:session.user.name,email:session.user.email}});
  }
  if(request.method==='DELETE'){
   await runtime.pool.query(communitySchema);
   await runtime.pool.query('DELETE FROM pagesignal_community WHERE user_id=$1',[userId]);
   return reply({deleted:true});
  }
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Use JSON.'},400);
  let input;try{input=await body(request);}catch(error){return reply({error:error instanceof RangeError?'Form is too large.':'Invalid JSON.'},error instanceof RangeError?413:400);}
  if(!input||input.consent!==true||typeof input.organization!=='string'||input.organization.trim().length>120||
   typeof input.use_case!=='string'||!input.use_case.trim()||input.use_case.trim().length>1000||
   !['hosted_web','hosted_api','core','sdk','react','self_hosted','evaluating'].includes(input.integration)||typeof input.contact_opt_in!=='boolean')return reply({error:'Provide a use case, select an integration and agree to share your registration.'},400);
  await runtime.pool.query(communitySchema);
  const saved=await runtime.pool.query(`INSERT INTO pagesignal_community(user_id,organization,use_case,integration,contact_opt_in)
   VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET organization=EXCLUDED.organization,use_case=EXCLUDED.use_case,
   integration=EXCLUDED.integration,contact_opt_in=EXCLUDED.contact_opt_in,consented_at=now(),updated_at=now()
   WHERE pagesignal_community.updated_at<now()-interval '5 seconds' RETURNING user_id`,[userId,input.organization.trim(),input.use_case.trim(),input.integration,input.contact_opt_in]);
  return saved.rows.length?reply({saved:true}):reply({error:'Wait a few seconds before saving again.'},429);
 }catch{return reply({error:'Community service is temporarily unavailable.'},503);}
}
