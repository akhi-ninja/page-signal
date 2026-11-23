import {defineComponent,h,shallowRef,onBeforeUnmount,computed,watch,ref,nextTick} from 'vue';
import {createWorkspace,downloadJSON} from '@pagesignal/sdk/workspace';
import {mountPreview} from '@pagesignal/sdk/preview';
export const PageSignalWorkspace=defineComponent({
 name:'PageSignalWorkspace',
 props:{adapter:{type:Object,required:true},maxFiles:{type:Number,default:10},concurrency:{type:Number,default:2},enhancedPreview:{type:Boolean,default:false},previewRenderer:{type:Object},onSourceNavigate:{type:Function}},
 emits:['resultsChange'],
 setup(props,{emit,slots}) {
  const store=createWorkspace({adapter:{extract:input=>props.adapter.extract(input),query:input=>props.adapter.query ? props.adapter.query(input) : Promise.reject(new Error('Configure a query adapter.'))},maxFiles:props.maxFiles,concurrency:props.concurrency});
  const state=shallowRef(store.getSnapshot()),question=shallowRef('');
  const unsubscribe=store.subscribe(()=>{state.value=store.getSnapshot();emit('resultsChange',state.value.documents);});
  const previewHost=ref(null);let previewController;
  onBeforeUnmount(()=>{previewController?.dispose();unsubscribe();store.dispose();});
  const current=computed(()=>state.value.documents.find(d=>d.id===state.value.selectedId));
  watch([()=>current.value?.id,()=>props.enhancedPreview,()=>props.previewRenderer],async(_,__,onCleanup)=>{let cancelled=false;onCleanup(()=>{cancelled=true;previewController?.dispose();previewController=null;});await nextTick();if(cancelled||!props.enhancedPreview||!current.value||!previewHost.value)return;const d=current.value;previewController=mountPreview(previewHost.value,{file:d.file,url:d.previewUrl,renderer:props.previewRenderer,onSourceNavigate:s=>props.onSourceNavigate?.(s)});},{immediate:true});
  const button=(text,click,disabled=false)=>h('button',{type:'button',onClick:click,disabled},text);
  return ()=> {
   const d=current.value;
   return h('section',{class:'pagesignal-workspace','aria-label':'PageSignal document workspace',style:{color:'var(--pagesignal-color,#201a43)',background:'var(--pagesignal-background,#fff)'}},[
    h('div',{onDragover:e=>e.preventDefault(),onDrop:e=>{e.preventDefault();store.addFiles(e.dataTransfer.files);},style:{border:'2px dashed var(--pagesignal-accent,#7050ce)',padding:'1rem'}},[
     h('label',['Upload documents or drop files here ',h('input',{type:'file',style:{maxWidth:'100%'},multiple:true,accept:'.pdf,.png,.jpg,.jpeg,.webp,.bmp',onChange:e=>{store.addFiles(e.target.files);e.target.value='';}})])]),
    state.value.error?h('p',{role:'alert'},state.value.error):null,
    h('ul',state.value.documents.map(doc=>h('li',{key:doc.id},[
     button(doc.name,()=>store.select(doc.id)),h('span',{'aria-live':'polite'},` ${doc.status} `),
     ['queued','processing'].includes(doc.status)?button('Cancel',()=>store.cancel(doc.id)):null,
     ['error','cancelled'].includes(doc.status)?button('Retry',()=>store.retry(doc.id)):null,button('Remove',()=>store.remove(doc.id))]))),
    d?h('div',{style:{display:'flex',flexWrap:'wrap',gap:'1rem'}},[
     h('section',{style:{flex:'1 1 300px',minWidth:0}},[
      h('h2',d.name),d.error?h('p',{role:'alert'},d.error):null,
      d.status==='processing'?h('progress',{'aria-label':'Extracting document'}):null,
      ...(d.result?.fields || []).map((field,index)=>slots.field?h('div',{key:index},slots.field({field,index,document:d,update:value=>store.updateField(d.id,index,value),showSource:()=>previewController?.focusSource(field.source)})):h('label',{key:index,style:{display:'block'}},[field.label,h('input',{style:{maxWidth:'100%',boxSizing:'border-box'},value:typeof field.value==='object'?JSON.stringify(field.value):field.value??'',onInput:e=>store.updateField(d.id,index,e.target.value)}),field.source?h('span',[h('small',` Page ${field.source.page??'?'}: ${field.source.excerpt??''}`),props.enhancedPreview?button('Show source',()=>previewController?.focusSource(field.source)):null]):null])),
      d.result?h('details',[h('summary','JSON'),h('pre',{style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}},JSON.stringify(d.result,null,2))]):null,
      button('Export JSON',()=>downloadJSON(store.exportJSON(d.id)),!d.result),
      h('label',['Question or fields to find',h('textarea',{value:question.value,onInput:e=>question.value=e.target.value})]),
      button('Find fields',()=>store.query(d.id,question.value,'fields'),!d.result||d.queryPending||!question.value.trim()),
      button('Ask',()=>store.query(d.id,question.value,'chat'),!d.result||d.queryPending||!question.value.trim()),
      d.queryPending?h('p',{role:'status'},'Finding information…'):null,
      d.queryResult?h('pre',{'aria-live':'polite',style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}},JSON.stringify(d.queryResult,null,2)):null]),
     h('section',{style:{flex:'2 1 400px',minWidth:0}},[h('h2','Document preview'),
      props.enhancedPreview?h('div',{ref:previewHost}):d.file.type==='application/pdf'?h('object',{data:d.previewUrl,type:'application/pdf',style:{width:'100%',height:'700px'}},[h('a',{href:d.previewUrl,target:'_blank',rel:'noopener'},'Open PDF')]):h('img',{src:d.previewUrl,alt:d.name,style:{maxWidth:'100%'}})])
    ]):h('p','Upload a document to begin.')
   ]);
  };
 }
});
