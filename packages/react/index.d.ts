import type {ReactElement} from 'react';
import type {WorkspaceAdapter,WorkspaceDocument} from '@pagesignal/sdk/workspace';
export interface PageSignalWorkspaceProps {adapter:WorkspaceAdapter;maxFiles?:number;concurrency?:number;className?:string;onResultsChange?:(documents:WorkspaceDocument[])=>void}
export function PageSignalWorkspace(props:PageSignalWorkspaceProps):ReactElement;
