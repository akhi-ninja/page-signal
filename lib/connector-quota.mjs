// Separate connector quota; does not consume document AI allowance.
export const connectorQuotaSchema=`CREATE TABLE IF NOT EXISTS pagesignal_connector_quota (
 subject text NOT NULL, day date NOT NULL, requests integer NOT NULL, minute bigint NOT NULL,
 minute_requests integer NOT NULL, PRIMARY KEY(subject,day)
)`;
const reserve=`INSERT INTO pagesignal_connector_quota(subject,day,requests,minute,minute_requests)
 VALUES($1,$2,1,$3,1) ON CONFLICT(subject,day) DO UPDATE SET
 requests=pagesignal_connector_quota.requests+1,minute=EXCLUDED.minute,
 minute_requests=CASE WHEN pagesignal_connector_quota.minute=EXCLUDED.minute THEN pagesignal_connector_quota.minute_requests+1 ELSE 1 END
 WHERE pagesignal_connector_quota.requests<$4 AND (pagesignal_connector_quota.minute<>EXCLUDED.minute OR pagesignal_connector_quota.minute_requests<$5)
 RETURNING requests`;
export async function reserveConnectorExecution(pool,owner,now=new Date()){
 if(typeof owner!=='string'||!owner)throw Error('Account required');
 const day=now.toISOString().slice(0,10),minute=Math.floor(now.getTime()/60000),client=await pool.connect();
 try{await client.query('BEGIN');
 for(const [subject,daily,perMinute] of [['global',500,30],['account:'+owner,50,5]]){
 const result=await client.query(reserve,[subject,day,minute,daily,perMinute]);
 if(!result.rows.length){await client.query('ROLLBACK');return {allowed:false}}
 }
 await client.query('COMMIT');return {allowed:true};
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
}
