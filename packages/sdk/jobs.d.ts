import type {DocumentPage,DocumentResult} from '@pagesignal/sdk/document';
export interface JobStatus {id:string;schema_version:'pagesignal.job.v1';status:'queued'|'processing'|'needs_review'|'approved'|'cancelled';expires_at:string;pages:{page:number;status:string;attempts:number;error:{code:string}|null;metrics:{duration_ms:number;attempt:number;provider_started?:boolean;usage?:Record<string,number|null>|null}|null}[];result:DocumentResult;approved_result:DocumentResult|null}
export function createDocumentJobClient(options?:{endpoint?:string;fetch?:typeof fetch}):{
 create(pages:{page:number;image:string;text:string}[],idempotencyKey:string,signal?:AbortSignal):Promise<{id:string;status:string;created:boolean}>;
 status(id:string,signal?:AbortSignal):Promise<JobStatus>;
 cancel(id:string,signal?:AbortSignal):Promise<JobStatus>;
 retry(id:string,signal?:AbortSignal):Promise<JobStatus>;
 approve(id:string,pages?:DocumentPage[],signal?:AbortSignal):Promise<JobStatus>;
 delete(id:string,signal?:AbortSignal):Promise<{deleted:boolean}>;
};
