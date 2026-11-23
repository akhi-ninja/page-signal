/** Safe standard Retry-After parsing and bounded scheduling. Does not execute or repeat requests. */
export function retryAfterSeconds(value,now=Date.now()){
 if(value===null||value===undefined||!String(value).trim())return 60;
 const numeric=Number(value);if(Number.isFinite(numeric)&&numeric>0)return Math.min(300,Math.max(1,Math.ceil(numeric)));
 const date=Date.parse(String(value));return Number.isFinite(date)?Math.min(300,Math.max(1,Math.ceil((date-now)/1000))):60;
}
export function boundedRetryDelay({attempt=1,retryAfter,random=Math.random}={}){
 if(!Number.isInteger(attempt)||attempt<1||attempt>2)throw new RangeError('Retry attempt exceeds job budget');
 const supplied=Number(retryAfter),base=Number.isFinite(supplied)&&supplied>0?Math.min(300,supplied):Math.min(300,15*2**(attempt-1));
 const jitter=Math.floor(Math.max(0,Math.min(1,Number(random())||0))*Math.min(5,base*.1));return Math.min(300,Math.ceil(base)+jitter);
}
