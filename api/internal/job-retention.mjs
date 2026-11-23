import {timingSafeEqual} from 'node:crypto';
import {getAuthRuntime} from '../../lib/auth.mjs';
import {createJobStore} from '../../lib/document-jobs.mjs';
export default {async fetch(request){
 const secret=process.env.CRON_SECRET,actual=request.headers.get('authorization')||'',expected='Bearer '+secret;
 if(!secret||secret.length<32||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return new Response('Unauthorized',{status:401});
 const runtime=getAuthRuntime(process.env);if(!runtime)return new Response('Unavailable',{status:503});
 try{await createJobStore(runtime.pool,process.env.BETTER_AUTH_SECRET).prune();return new Response(null,{status:204});}catch(error){return new Response(error.code==='42P01'?null:'Unavailable',{status:error.code==='42P01'?204:503});}
}};
