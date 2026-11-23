import {ChangeDetectionStrategy,Component,EventEmitter,Input,Output,OnInit,OnDestroy,signal,inject,ChangeDetectorRef,ViewChild,ElementRef,AfterViewChecked,TemplateRef} from '@angular/core';
import {CommonModule} from '@angular/common';
import {DomSanitizer,SafeResourceUrl} from '@angular/platform-browser';
import {createWorkspace,downloadJSON,WorkspaceAdapter,WorkspaceController,WorkspaceDocument,WorkspaceState} from '@pagesignal/sdk/workspace';
import {mountPreview,PreviewRenderer,SourceEvidence} from '@pagesignal/sdk/preview';
export type {WorkspaceAdapter,WorkspaceDocument} from '@pagesignal/sdk/workspace';
@Component({
 selector:'pagesignal-workspace',standalone:true,imports:[CommonModule],changeDetection:ChangeDetectionStrategy.OnPush,
 styles:[`:host{display:block;color:var(--pagesignal-color,#201a43);background:var(--pagesignal-background,#fff)}.drop{border:2px dashed var(--pagesignal-accent,#7050ce);padding:1rem}.review{display:flex;flex-wrap:wrap;gap:1rem}.fields{flex:1 1 300px;min-width:0}.preview{flex:2 1 400px;min-width:0}label{display:block}input,textarea{max-width:100%;box-sizing:border-box}img{max-width:100%}object{width:100%;height:700px}pre{white-space:pre-wrap;overflow-wrap:anywhere}`],
 template:`<section aria-label="PageSignal document workspace">
 <div class="drop" (dragover)="$event.preventDefault()" (drop)="drop($event)"><label>Upload documents or drop files here <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp" (change)="upload($event)"></label></div>
 @if(state().error){<p role="alert">{{state().error}}</p>}
 <ul>@for(doc of state().documents;track doc.id){<li><button type="button" (click)="store.select(doc.id)">{{doc.name}}</button> <span aria-live="polite">{{doc.status}}</span>
 @if(doc.status==='queued'||doc.status==='processing'){<button type="button" (click)="store.cancel(doc.id)">Cancel</button>}
 @if(doc.status==='error'||doc.status==='cancelled'){<button type="button" (click)="store.retry(doc.id)">Retry</button>}
 <button type="button" (click)="store.remove(doc.id)">Remove</button></li>}</ul>
 @if(current;as doc){<div class="review"><section class="fields"><h2>{{doc.name}}</h2>
 @if(doc.error){<p role="alert">{{doc.error}}</p>}@if(doc.status==='processing'){<progress aria-label="Extracting document"></progress>}
 @for(field of doc.result?.fields || [];track $index){@if(fieldTemplate){<ng-container [ngTemplateOutlet]="fieldTemplate" [ngTemplateOutletContext]="{$implicit:field,index:$index,document:doc,controller:store}"></ng-container>}@else{<label>{{field.label}}<input [value]="display(field.value)" (input)="edit(doc.id,$index,$event)">@if(field.source){<small>Page {{field.source.page}}: {{field.source.excerpt}}</small>@if(enhancedPreview){<button type="button" (click)="showSource(field.source)">Show source</button>}}</label>}}
 @if(doc.result){<details><summary>JSON</summary><pre>{{doc.result | json}}</pre></details>}
 <button type="button" [disabled]="!doc.result" (click)="export(doc.id)">Export JSON</button>
 <label>Question or fields to find<textarea [value]="question" (input)="question=$any($event.target).value"></textarea></label>
 <button type="button" [disabled]="!doc.result || doc.queryPending || !question.trim()" (click)="store.query(doc.id,question,'fields')">Find fields</button>
 <button type="button" [disabled]="!doc.result || doc.queryPending || !question.trim()" (click)="store.query(doc.id,question,'chat')">Ask</button>
 @if(doc.queryPending){<button type="button" (click)="store.cancelQuery(doc.id)">Cancel question</button><p role="status">Finding information…</p>}@if(doc.queryResult){<pre aria-live="polite">{{doc.queryResult | json}}</pre>}
 </section><section class="preview"><h2>Document preview</h2>@if(enhancedPreview){<div #previewHost></div>}@else if(doc.file.type==='application/pdf'){<object [data]="preview" type="application/pdf"><a [href]="doc.previewUrl" target="_blank" rel="noopener">Open PDF</a></object>}@else{<img [src]="doc.previewUrl" [alt]="doc.name">}</section></div>}@else{<p>Upload a document to begin.</p>}
 </section>`
})
export class PageSignalWorkspaceComponent implements OnInit,OnDestroy,AfterViewChecked {
 @Input({required:true}) adapter!:WorkspaceAdapter;
 @Input() enhancedPreview=false; @Input() previewRenderer?:PreviewRenderer; @Input() fieldTemplate?:TemplateRef<any>;
 @Output() sourceNavigate=new EventEmitter<SourceEvidence>();
 @ViewChild('previewHost') previewHost?:ElementRef<HTMLElement>;
 private previewController?:ReturnType<typeof mountPreview>;private renderedHost?:HTMLElement;private renderedId?:string;private renderedAdapter?:PreviewRenderer;
 @Input() maxFiles=10; @Input() concurrency=2;
 @Output() resultsChange=new EventEmitter<WorkspaceDocument[]>();
 state=signal<WorkspaceState>({documents:[],selectedId:null,error:''});
 store!:WorkspaceController;question='';preview:SafeResourceUrl|null=null;
 private previewUrl:string|null=null;
 private unsubscribe?:()=>void; private sanitizer=inject(DomSanitizer);private changeDetector=inject(ChangeDetectorRef);
 get current(){return this.state().documents.find(d=>d.id===this.state().selectedId);}
 ngOnInit(){
  this.store=createWorkspace({adapter:{extract:input=>this.adapter.extract(input),query:input=>this.adapter.query?this.adapter.query(input):Promise.reject(new Error('Configure a query adapter.'))},maxFiles:this.maxFiles,concurrency:this.concurrency});
  this.unsubscribe=this.store.subscribe(()=>{
   this.state.set(this.store.getSnapshot());
   // Only locally-created object URLs from validated uploads are trusted. No external URL input.
   const url=this.current?.previewUrl || null;
   if(url!==this.previewUrl){this.previewUrl=url;this.preview=url?this.sanitizer.bypassSecurityTrustResourceUrl(url):null;}
   this.resultsChange.emit(this.state().documents);this.changeDetector.markForCheck();
  });
 }
 ngAfterViewChecked(){const host=this.previewHost?.nativeElement,doc=this.current;
  if(host===this.renderedHost&&doc?.id===this.renderedId&&this.previewRenderer===this.renderedAdapter)return;
  this.previewController?.dispose();this.renderedHost=host;this.renderedId=doc?.id;this.renderedAdapter=this.previewRenderer;
  if(host&&doc&&this.enhancedPreview)this.previewController=mountPreview(host,{file:doc.file,url:doc.previewUrl,renderer:this.previewRenderer,onSourceNavigate:s=>this.sourceNavigate.emit(s)});
 }
 showSource(source:Partial<SourceEvidence>){if(source.page)this.previewController?.focusSource(source as SourceEvidence);}
 ngOnDestroy(){this.previewController?.dispose();this.unsubscribe?.();this.store?.dispose();}
 upload(event:Event){const input=event.target as HTMLInputElement;this.store.addFiles(input.files || []);input.value='';}
 drop(event:DragEvent){event.preventDefault();this.store.addFiles(event.dataTransfer?.files || []);}
 edit(id:string,index:number,event:Event){this.store.updateField(id,index,(event.target as HTMLInputElement).value);}
 display(value:unknown){return typeof value==='object'?JSON.stringify(value):value??'';}
 export(id:string){downloadJSON(this.store.exportJSON(id));}
}
