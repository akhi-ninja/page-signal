import type {PageField,PageResult,DocumentPage,DocumentResult} from './document.js';
export {PageResult,DocumentPage,DocumentResult};
export type Scalar=string|number|boolean|null;
export interface SourceEvidence {page:number;excerpt:string|null;box?:{x:number;y:number;width:number;height:number};coordinate_system?:'normalized_upright_page'}
export interface ResultMetadata {model?:string;prompt_version?:string;source_revision?:string}
export interface QueryResult {answer:string;citations:SourceEvidence[];fields:{label:string;value:Scalar;source:SourceEvidence|null;[key:string]:unknown}[]}
export interface ErrorResult {error:string;code:string;retryable:boolean;retry_after_seconds?:number|null}
export type ReviewState='needs_review'|'manually_reviewed'|'blank'|'illegible'|'not_found'|'conflicting';
export interface VersionedField extends PageField {id:string;original_value:string|null;normalized_value:string|null;review_state:ReviewState;source:SourceEvidence}
export interface PageEnvelope {schema_version:'pagesignal.page.v1';page:number;result:Omit<PageResult,'fields'>&{fields:VersionedField[]};metadata:ResultMetadata}
export interface QueryEnvelope {schema_version:'pagesignal.query.v1';result:QueryResult;metadata:ResultMetadata}
export interface ErrorEnvelope extends ErrorResult {schema_version:'pagesignal.error.v1'}
export type ResultEnvelope=PageEnvelope|QueryEnvelope|ErrorEnvelope|DocumentResult;
export const RESULT_VERSIONS:Readonly<{page:'pagesignal.page.v1';document:'pagesignal.document.v1';query:'pagesignal.query.v1';error:'pagesignal.error.v1'}>;
export function validatePageResult(value:unknown):PageResult;
export function validateEvidence(value:unknown):SourceEvidence;
export function validateTable(value:unknown):PageResult['tables'][number];
export function validateQueryResult(value:unknown):QueryResult;
export function validateErrorResult(value:unknown):ErrorResult;
export function validateEnvelope(value:unknown):ResultEnvelope;
export function toPageEnvelope(value:PageResult,options?:ResultMetadata&{page?:number}):PageEnvelope;
export function toQueryEnvelope(value:QueryResult,options?:ResultMetadata):QueryEnvelope;
export function toDocumentEnvelope(value:DocumentPage[],options?:ResultMetadata):DocumentResult&{metadata:ResultMetadata};
export function toErrorEnvelope(value:ErrorResult):ErrorEnvelope;
export function migrateLegacyResult(value:unknown,options:ResultMetadata&{kind:'page'|'query'|'document'|'error'|'workspace-v3';page?:number}):ResultEnvelope;
export function mergeRequestedFields(existing:({id:string}&Record<string,unknown>)[],query:QueryResult,options:{queryId:string}):({id:string}&Record<string,unknown>)[];
