import {randomUUID} from 'node:crypto';
import {sealCredential} from './connector-credentials.mjs';
export const connectorSchema = `CREATE TABLE IF NOT EXISTS pagesignal_connections (
 owner_id text NOT NULL, id uuid NOT NULL, name text NOT NULL, endpoint text NOT NULL,
 auth_type text NOT NULL, logo text, credential text, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,id)
)`;
function ownerCheck(owner){if(typeof owner!=='string'||!owner||owner.length>256)throw Error('Invalid account')}
export function validateConnection(input){
 if(!input||typeof input.name!=='string'||!input.name.trim()||input.name.length>120)throw Error('Invalid name');
 if(typeof input.endpoint!=='string'||input.endpoint.length>2048)throw Error('Invalid endpoint');
 const url=new URL(input.endpoint);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port)throw Error('Use HTTPS without credentials, query or custom port');
 if(!['None','API key header','Bearer token'].includes(input.auth))throw Error('Unsupported authentication');
 const logo=input.logo||null;
 if(logo!==null&&(typeof logo!=='string'||logo.length>350000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(logo)))throw Error('Invalid normalized PNG logo');
 return {name:input.name.trim(),endpoint:url.href,auth:input.auth,logo};
}
const publicColumns='id,name,endpoint,auth_type AS auth,logo,updated_at,(credential IS NOT NULL) AS has_credential';
export async function listConnections(pool,owner){ownerCheck(owner);return (await pool.query('SELECT '+publicColumns+' FROM pagesignal_connections WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 100',[owner])).rows}
export async function createConnection(pool,owner,input,env=process.env){
 ownerCheck(owner);const c=validateConnection(input),id=randomUUID();
 if(c.auth==='None'&&input.secret!==undefined)throw Error('Unexpected credential');
 const credential=c.auth==='None'?null:sealCredential(input.secret,owner,id,env);
 const client=await pool.connect();
 try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['connector:'+owner]);const count=await client.query('SELECT count(*)::int AS n FROM pagesignal_connections WHERE owner_id=$1',[owner]);if(count.rows[0].n>=100)throw Error('Connection limit reached');
 const result=await client.query('INSERT INTO pagesignal_connections(owner_id,id,name,endpoint,auth_type,logo,credential) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING '+publicColumns,[owner,id,c.name,c.endpoint,c.auth,c.logo,credential]);await client.query('COMMIT');return result.rows[0];
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
}
export async function deleteConnection(pool,owner,id){ownerCheck(owner);if(typeof id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('Invalid connection ID');return (await pool.query('DELETE FROM pagesignal_connections WHERE owner_id=$1 AND id=$2',[owner,id])).rowCount===1}
