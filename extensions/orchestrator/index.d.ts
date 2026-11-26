import type { BaseCheckpointSaver } from '@langchain/langgraph';
export interface Page { image: string; text: string; [key: string]: unknown }
export interface Field { label: string; section: string|null; value: string|null; evidence: string|null; state: 'filled'|'blank'|'illegible'|'checked'|'unchecked' }
export interface PageResult { document_type: string; classification_status: 'identified'|'needs_review'|'unidentified'; fields: Field[]; tables: {columns:string[];rows:(string|null)[][]}[]; review_notes: string[]; [key:string]:unknown }
export interface WorkflowConfig { configurable?: {thread_id:string}; recursionLimit?:number; signal?:AbortSignal }
export interface WorkflowState { schemaVersion:number; attempts:number; result:PageResult|null; issues:string[]; status:'processing'|'needs_review'|'completed'|'rejected'; recheckSkipped:boolean; recheckIssues:string[]; __interrupt__?:unknown[] }
export function inspectResult(result:unknown,sourceText?:string|null):string[];
export function workflowConfig(input:{tenantId:string;documentId:string}):WorkflowConfig;
export function createPageWorkflow(options:{page:Page;extractPage:(page:Page)=>Promise<PageResult>;checkpointer?:BaseCheckpointSaver;requireApproval?:boolean;maxCalls?:1|2;reserveAdditional?:()=>Promise<boolean>;prepareRecheck?:(result:PageResult,page:Page)=>Promise<{page:Page;mode?:string;target?:unknown}|null>}):{start(config?:WorkflowConfig):Promise<WorkflowState>;resume(decision:{approved:boolean;result?:PageResult},config:WorkflowConfig):Promise<WorkflowState>;graph:unknown};
