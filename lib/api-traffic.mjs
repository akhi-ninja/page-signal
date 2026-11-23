import {isIP} from 'node:net';
// Aggregate metadata only: never persist IPs, URL paths/query strings, bodies or credentials.
export const trafficSchema=`CREATE TABLE IF NOT EXISTS pagesignal_api_traffic (
 day date NOT NULL, environment text NOT NULL, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 country text NOT NULL, region text NOT NULL, source_host text NOT NULL, source_kind text NOT NULL,
 endpoint text NOT NULL, method text NOT NULL, status integer NOT NULL,
 requests integer NOT NULL DEFAULT 0, duration_ms bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(day,environment,user_id,country,region,source_host,source_kind,endpoint,method,status)
)`;
export const trafficEnvironment=env=>env.VERCEL_ENV==='production'?'production':env.VERCEL_ENV==='preview'?'preview':'self_hosted';
export function trafficMetadata(request,env={}){
 const trusted=env.VERCEL==='1'&&['production','preview'].includes(env.VERCEL_ENV);
 const country=trusted&&(request.headers.get('x-vercel-ip-country')||'').toUpperCase();
 const region=trusted&&(request.headers.get('x-vercel-ip-country-region')||'').toUpperCase();
 let host='',kind='missing';
 for(const header of ['origin','referer']){
  const raw=request.headers.get(header);if(!raw||raw.length>2048)continue;
  try{const url=new URL(raw);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.hostname.length>253||isIP(url.hostname.replace(/^\[|\]$/g,'')))continue;
   host=url.hostname.toLowerCase();kind=header==='origin'?'reported_origin':'reported_referrer';break;
  }catch{}
 }
 return {country:/^[A-Z]{2}$/.test(country)?country:'Unknown',region:/^[A-Z0-9-]{1,8}$/.test(region)?region:'Unknown',source_host:host||'Unknown',source_kind:kind};
}
export async function pruneTraffic(pool){await pool.query(trafficSchema);await pool.query("DELETE FROM pagesignal_api_traffic WHERE day<(now() AT TIME ZONE 'UTC')::date-29");}
export async function recordTraffic(pool,{request,env,userId,endpoint,status,durationMs}){
 if(!userId||!['/api/ai/extract','/api/ai/jobs'].includes(endpoint))return;
 const m=trafficMetadata(request,env);await pruneTraffic(pool);
 await pool.query(`INSERT INTO pagesignal_api_traffic(day,environment,user_id,country,region,source_host,source_kind,endpoint,method,status,requests,duration_ms)
 VALUES((now() AT TIME ZONE 'UTC')::date,$1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10)
 ON CONFLICT(day,environment,user_id,country,region,source_host,source_kind,endpoint,method,status)
 DO UPDATE SET requests=pagesignal_api_traffic.requests+1,duration_ms=pagesignal_api_traffic.duration_ms+EXCLUDED.duration_ms`,
 [trafficEnvironment(env),userId,m.country,m.region,m.source_host,m.source_kind,endpoint,request.method,status,Math.max(0,Math.round(durationMs))]);
}
export async function readTraffic(pool,env){
 await pruneTraffic(pool);const args=[trafficEnvironment(env)];
 const where="environment=$1 AND day>=(now() AT TIME ZONE 'UTC')::date-29";
 const summary=await pool.query(`SELECT coalesce(sum(requests),0)::int AS requests,count(DISTINCT user_id)::int AS active_accounts,
 coalesce(sum(CASE WHEN status>=400 THEN requests ELSE 0 END),0)::int AS failed_requests,min(day)::text AS first_recorded_day FROM pagesignal_api_traffic WHERE ${where}`,args);
 const locations=await pool.query(`SELECT country,region,sum(requests)::int AS requests,count(DISTINCT user_id)::int AS accounts FROM pagesignal_api_traffic WHERE ${where} GROUP BY country,region ORDER BY requests DESC,country,region LIMIT 50`,args);
 const sources=await pool.query(`SELECT source_host,source_kind,sum(requests)::int AS requests,count(DISTINCT user_id)::int AS accounts FROM pagesignal_api_traffic WHERE ${where} GROUP BY source_host,source_kind ORDER BY requests DESC,source_host,source_kind LIMIT 50`,args);
 const endpoints=await pool.query(`SELECT endpoint,method,status,sum(requests)::int AS requests,round(sum(duration_ms)::numeric/nullif(sum(requests),0))::int AS average_ms FROM pagesignal_api_traffic WHERE ${where} GROUP BY endpoint,method,status ORDER BY requests DESC,endpoint,method,status LIMIT 50`,args);
 return {available:true,environment:args[0],summary:summary.rows[0],locations:locations.rows,sources:sources.rows,endpoints:endpoints.rows};
}
export async function observeTraffic(request,env,dependencies,endpoint,run){
 let userId;const started=performance.now();
 const response=await run(id=>{userId=id;});
 if(userId){try{const runtime=dependencies.getRuntime?.(env);if(runtime)await (dependencies.recordTraffic||recordTraffic)(runtime.pool,{request,env,userId,endpoint,status:response.status,durationMs:performance.now()-started});}catch{console.warn('API metadata aggregation unavailable');}}
 return response;
}
