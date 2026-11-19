import type {DefineComponent} from 'vue';
import type {WorkspaceAdapter,WorkspaceDocument} from '@pagesignal/sdk/workspace';
export const PageSignalWorkspace: DefineComponent<{adapter:WorkspaceAdapter;maxFiles?:number;concurrency?:number;onResultsChange?:(documents:WorkspaceDocument[])=>void}>;
