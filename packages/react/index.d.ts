import type {PreviewRenderer,SourceEvidence} from '@pagesignal/sdk/preview';
import type {ReactElement,ReactNode} from 'react';
import type {WorkspaceAdapter,WorkspaceDocument,ExtractedField} from '@pagesignal/sdk/workspace';
export interface PageSignalWorkspaceProps {adapter:WorkspaceAdapter;maxFiles?:number;concurrency?:number;className?:string;enhancedPreview?:boolean;previewRenderer?:PreviewRenderer;onSourceNavigate?:(source:SourceEvidence)=>void;renderField?:(context:{field:ExtractedField;index:number;document:WorkspaceDocument;update(value:unknown):void;showSource():void})=>ReactNode;onResultsChange?:(documents:WorkspaceDocument[])=>void}
export function PageSignalWorkspace(props:PageSignalWorkspaceProps):ReactElement;
