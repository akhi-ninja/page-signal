import type {PreviewRenderer,SourceEvidence} from '@pagesignal/sdk/preview';
import type {DefineComponent} from 'vue';
import type {WorkspaceAdapter,WorkspaceDocument} from '@pagesignal/sdk/workspace';
export const PageSignalWorkspace: DefineComponent<{adapter:WorkspaceAdapter;maxFiles?:number;concurrency?:number;enhancedPreview?:boolean;previewRenderer?:PreviewRenderer;onSourceNavigate?:(source:SourceEvidence)=>void;onResultsChange?:(documents:WorkspaceDocument[])=>void}>;
