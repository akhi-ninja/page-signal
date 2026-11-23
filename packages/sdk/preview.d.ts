export interface SourceEvidence {page:number;excerpt?:string;box?:{x:number;y:number;width:number;height:number}}
/** Render one upright page with no padding/margins; coordinates refer to that page. */
export interface PreviewRenderer {
 getPageCount(input:{file:File;signal:AbortSignal}):Promise<number>;
 renderPage(input:{file:File;page:number;container:HTMLElement;signal:AbortSignal}):Promise<void>;
}
export interface PreviewOptions {file:File;url:string;renderer?:PreviewRenderer;onSourceNavigate?:(source:SourceEvidence)=>void}
export function mountPreview(container:HTMLElement,options:PreviewOptions):{focusSource(source:SourceEvidence):boolean;dispose():void};
