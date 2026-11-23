import type {SourceEvidence} from '@pagesignal/sdk/preview';
export interface ExtractedField { label: string; value: unknown; edited?: boolean; source?: Partial<SourceEvidence>; [key:string]:unknown }
export interface ExtractionResult { fields?: ExtractedField[]; [key:string]:unknown }
export interface WorkspaceAdapter {
  extract(input:{file:File;signal:AbortSignal}): Promise<ExtractionResult>;
  query?(input:{file:File;result:ExtractionResult;question:string;mode:'fields'|'chat';signal:AbortSignal}): Promise<unknown>;
}
export interface WorkspaceDocument {
 id:string; file:File; name:string; previewUrl:string; status:'queued'|'processing'|'complete'|'error'|'cancelled'; result:ExtractionResult|null; error:string; queryResult:unknown; queryPending:boolean;
}
export interface WorkspaceState { documents:WorkspaceDocument[]; selectedId:string|null; error:string }
export interface WorkspaceOptions {adapter:WorkspaceAdapter;concurrency?:number;maxFiles?:number;maxFileBytes?:number;maxBatchBytes?:number}
export interface WorkspaceController {
 subscribe(listener:()=>void):()=>void; getSnapshot():WorkspaceState;
 addFiles(files:Iterable<File>|ArrayLike<File>):void;select(id:string):void;remove(id:string):void;cancel(id:string):void;retry(id:string):void;
 updateField(id:string,index:number,value:unknown):void; query(id:string,question:string,mode?:'fields'|'chat'):Promise<void>;
 exportJSON(id:string):string|null;dispose():void;
}
export function createWorkspace(options:WorkspaceOptions):WorkspaceController;
export function downloadJSON(json:string|null,filename?:string):void;
