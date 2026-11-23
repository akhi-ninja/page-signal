import {createHash,createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {reconcileDocument,validatePageResult} from '../packages/sdk/document.mjs';
export const JOB_SCHEMA=`CREATE TABLE IF NOT EXISTS pagesignal_document_jobs (
 id text PRIMARY KEY, owner_id text NOT NULL, idempotency_key text NOT NULL, input_hash text NOT NULL,
 status text NOT NULL, encrypted_state text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL, lease_until timestamptz, lease_token text,
 UNIQUE(owner_id,idempotency_key));
 CREATE INDEX IF NOT EXISTS pagesignal_document_jobs_expiry ON pagesignal_document_jobs(expires_at);`;
const keyFor=secret=>createHash('sha256').update('pagesignal.encrypted-jobs.v1\0'+secret).digest();
export function sealJob(value,secret,id){if(typeof secret!=='string'||secret.length<32)throw Error('Strong job encryption secret required');const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyFor(secret),iv);cipher.setAAD(Buffer.from(id));const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');}
export function openJob(value,secret,id){const data=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',keyFor(secret),data.subarray(0,12));cipher.setAAD(Buffer.from(id));cipher.setAuthTag(data.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8'));}
export function validateJobPages(pages){
 if(!Array.isArray(pages)||!pages.length||pages.length>40||new Set(pages.map(p=>p?.page)).size!==pages.length)throw Error('Provide 1–40 unique pages');
 for(const p of pages)if(!Number.isInteger(p.page)||p.page<1||p.page>40||typeof p.image!=='string'||p.image.length>3800000||!/^data:image\/jpeg;base64,[a-z0-9+/]+=*$/i.test(p.image)||typeof p.text!=='string'||p.text.length>20000)throw Error('Invalid rendered page');
 return pages;
}
function stateStatus(s){return s.cancelled?'cancelled':s.approved?'approved':s.pages.some(p=>p.status==='queued')?'queued':s.pages.some(p=>p.status==='processing')?'processing':'needs_review';}
export function publicJob(row,state){return {id:row.id,schema_version:'pagesignal.job.v1',status:row.status,expires_at:row.expires_at,pages:state.pages.map(p=>({page:p.page,status:p.status,attempts:p.attempts,error:p.error??null,metrics:p.metrics??null})),result:reconcileDocument(state.pages.map(p=>p.result?{page:p.page,result:p.result}:{page:p.page,error:{code:p.error?.code||p.status}})),approved_result:state.approved_result??null};}
export function createJobStore(pool,secret){
 const decrypt=row=>openJob(row.encrypted_state,secret,row.id);
 async function transaction(id,owner,change){const client=await pool.connect();try{await client.query('BEGIN');const found=await client.query('SELECT * FROM pagesignal_document_jobs WHERE id=$1 AND expires_at>now() FOR UPDATE',[id]);const row=found.rows[0];if(!row||(owner!==null&&row.owner_id!==owner)){await client.query('ROLLBACK');return null;}const state=decrypt(row),result=await change(state,row);await client.query('UPDATE pagesignal_document_jobs SET status=$2,encrypted_state=$3,lease_until=$4,lease_token=$5 WHERE id=$1',[id,stateStatus(state),sealJob(state,secret,id),row.lease_until,row.lease_token]);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
 return {
  migrate:()=>pool.query(JOB_SCHEMA),
  async prune(){return (await pool.query('DELETE FROM pagesignal_document_jobs WHERE expires_at<=now()')).rowCount;},
  async create(owner,pages,idempotencyKey){validateJobPages(pages);if(typeof idempotencyKey!=='string'||!/^[-a-zA-Z0-9_]{8,128}$/.test(idempotencyKey))throw Error('Invalid idempotency key');
   const canonical=pages.map(p=>({page:p.page,image:p.image,text:p.text})).sort((a,b)=>a.page-b.page);const hash=createHash('sha256').update(JSON.stringify(canonical)).digest('hex');const client=await pool.connect();try{
    await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(824193)");
    const previous=(await client.query('SELECT * FROM pagesignal_document_jobs WHERE owner_id=$1 AND idempotency_key=$2',[owner,idempotencyKey])).rows[0];
    if(previous){if(previous.input_hash!==hash)throw Error('Idempotency key already used for another input');if(new Date(previous.expires_at)<=new Date())throw Error('Idempotency key expired; use a new key');await client.query('COMMIT');return {id:previous.id,created:false};}
    const count=await client.query("SELECT COUNT(*)::int AS count FROM pagesignal_document_jobs WHERE expires_at>now() ",[]);
    const personal=await client.query("SELECT COUNT(*)::int AS count FROM pagesignal_document_jobs WHERE owner_id=$1 AND expires_at>now()",[owner]);
    if(count.rows[0].count>=100||personal.rows[0].count>=5)throw Error('Job capacity reached');
    const id=randomUUID(),state={schemaVersion:1,pages:canonical.map(p=>({page:p.page,input:{image:p.image,text:p.text},status:'queued',attempts:0})),cancelled:false,approved:false};
    await client.query("INSERT INTO pagesignal_document_jobs(id,owner_id,idempotency_key,input_hash,status,encrypted_state,expires_at) VALUES($1,$2,$3,$4,'queued',$5,now()+interval '24 hours')",[id,owner,idempotencyKey,hash,sealJob(state,secret,id)]);await client.query('COMMIT');return {id,created:true};
   }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  },
  async read(id,owner){const row=(await pool.query('SELECT * FROM pagesignal_document_jobs WHERE id=$1 AND owner_id=$2 AND expires_at>now()',[id,owner])).rows[0];return row?publicJob(row,decrypt(row)):null;},
  async delete(id,owner){return (await pool.query('DELETE FROM pagesignal_document_jobs WHERE id=$1 AND owner_id=$2',[id,owner])).rowCount;},
  async action(id,owner,action,approved){return transaction(id,owner,(state,row)=>{
   if(action==='cancel'){if(state.approved)throw Error('Job is terminal');state.cancelled=true;for(const p of state.pages)if(['queued','processing'].includes(p.status)){p.status='cancelled';p.error={code:'cancelled'};}}
   else if(action==='retry'){if(state.cancelled||state.approved)throw Error('Job is terminal');if(!row.lease_until||new Date(row.lease_until)<=new Date()){for(const p of state.pages)if(p.status==='processing'){p.status='failed';p.error={code:'interrupted_attempt_requires_review'};}row.lease_until=null;row.lease_token=null;}for(const p of state.pages)if(p.status==='failed'&&p.attempts<2&&p.input){p.status='queued';p.error=null;}}
   else if(action==='approve'){if(state.cancelled||state.pages.some(p=>['queued','processing'].includes(p.status)))throw Error('Job not ready for review');if(state.pages.some(p=>p.status!=='complete'))throw Error('Resolve failed pages before approval');
    if(approved){if(!Array.isArray(approved)||approved.length!==state.pages.length||new Set(approved.map(p=>p.page)).size!==approved.length||approved.some(p=>!state.pages.some(s=>s.page===p.page)))throw Error('Invalid approval pages');const reviewed=structuredClone(approved);for(const p of reviewed){validatePageResult(p.result);const original=state.pages.find(s=>s.page===p.page).result,occurrences=new Map();for(const field of p.result.fields){const key=JSON.stringify([field.section,field.label]),n=occurrences.get(key)||0;occurrences.set(key,n+1);const source=original.fields.filter(f=>f.section===field.section&&f.label===field.label)[n];field.original_value=source?.value??null;field.review_state='manually_reviewed';}}state.approved_result=reconcileDocument(reviewed);}else state.approved_result=reconcileDocument(state.pages.map(p=>({page:p.page,result:p.result})));
    state.approved_result.status='approved';state.approved_result.reviewed_at=new Date().toISOString();state.approved=true;if(Buffer.byteLength(JSON.stringify(publicJob({...row,status:'approved'},state)))>3500000)throw Error('Reviewed output exceeds response budget');
   }else throw Error('Invalid action');
   row.status=stateStatus(state);return publicJob(row,state);
  });},
  async claim(id){return transaction(id,null,(state,row)=>{
   if(state.cancelled||state.approved)return {kind:'terminal'};
   if(row.lease_until&&new Date(row.lease_until)>new Date())return {kind:'busy'};
   // A worker may have died after a paid call. Do not silently repeat it.
   for(const p of state.pages)if(p.status==='processing'){p.status='failed';p.error={code:'interrupted_attempt_requires_review'};}
   const page=state.pages.find(p=>p.status==='queued'&&p.attempts<2);
   if(!page)return {kind:'terminal'};
   page.attempts++;page.status='processing';row.lease_token=randomUUID();row.lease_until=new Date(Date.now()+150000);
   return {kind:'claimed',owner:row.owner_id,jobId:id,page:structuredClone(page),token:row.lease_token};
  });},
  async finish(claim,outcome){return transaction(claim.jobId,null,(state,row)=>{
   if(state.cancelled||row.lease_token!==claim.token)return {more:false};
   const page=state.pages.find(p=>p.page===claim.page.page);if(!page||page.status!=='processing')return {more:false};
   if(outcome.no_provider)page.attempts=Math.max(0,page.attempts-1);const {no_provider,...persisted}=outcome;Object.assign(page,persisted);if(outcome.result){validatePageResult(outcome.result);delete page.input;}
   if(Buffer.byteLength(JSON.stringify(publicJob(row,state)))>3500000){delete page.result;page.status='failed';page.error={code:'output_budget_exceeded_submit_smaller_job',retryable:false};for(const remaining of state.pages)if(remaining.status==='queued'){remaining.status='failed';remaining.error={code:'output_budget_exceeded_submit_smaller_job',retryable:false};delete remaining.input;}}
   row.lease_until=null;row.lease_token=null;
   return {more:state.pages.some(p=>p.status==='queued'),jobId:row.id};
  });}
 };
}
