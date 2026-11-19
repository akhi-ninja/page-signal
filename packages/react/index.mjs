import {createElement as h,useEffect,useState,useRef} from 'react';
import {createWorkspace,downloadJSON} from '@pagesignal/sdk/workspace';
/** Native DOM component. Keep adapter/config stable; changes recreate the workspace. */
export function PageSignalWorkspace({adapter,maxFiles=10,concurrency=2,className,onResultsChange}) {
 const callback=useRef(onResultsChange);callback.current=onResultsChange;
 const [store,setStore]=useState(null),[state,setState]=useState({documents:[],selectedId:null,error:''}),[question,setQuestion]=useState('');
 useEffect(()=>{
  const next=createWorkspace({adapter,maxFiles,concurrency});setStore(next);setState(next.getSnapshot());
  const unsubscribe=next.subscribe(()=>{const snapshot=next.getSnapshot();setState(snapshot);callback.current?.(snapshot.documents);});
  return ()=>{unsubscribe();next.dispose();};
 },[adapter,maxFiles,concurrency]);
 const d=state.documents.find(doc=>doc.id===state.selectedId);
 const button=(text,onClick,disabled=false)=>h('button',{type:'button',onClick,disabled},text);
 return h('section',{className,'aria-label':'PageSignal document workspace'},[
  h('div',{key:'upload',onDragOver:e=>e.preventDefault(),onDrop:e=>{e.preventDefault();store?.addFiles(e.dataTransfer.files);},style:{border:'2px dashed #7050ce',padding:'1rem'}},
   h('label',null,'Upload documents or drop files here ',h('input',{type:'file',multiple:true,accept:'.pdf,.png,.jpg,.jpeg,.webp,.bmp',onChange:e=>{store?.addFiles(e.target.files);e.target.value='';}}))),
  state.error?h('p',{key:'error',role:'alert'},state.error):null,
  h('ul',{key:'queue'},state.documents.map(doc=>h('li',{key:doc.id},
   button(doc.name,()=>store.select(doc.id)),h('span',{'aria-live':'polite'},` ${doc.status} `),
   ['queued','processing'].includes(doc.status)?button('Cancel',()=>store.cancel(doc.id)):null,
   ['error','cancelled'].includes(doc.status)?button('Retry',()=>store.retry(doc.id)):null,button('Remove',()=>store.remove(doc.id))))) ,
  d?h('div',{key:'review',style:{display:'flex',flexWrap:'wrap',gap:'1rem'}},
   h('section',{style:{flex:'1 1 300px',minWidth:0}},
    h('h2',null,d.name),d.error?h('p',{role:'alert'},d.error):null,
    d.status==='processing'?h('progress',{'aria-label':'Extracting document'}):null,
    ...(d.result?.fields||[]).map((field,index)=>h('label',{key:index,style:{display:'block'}},field.label,
     h('input',{value:typeof field.value==='object'?JSON.stringify(field.value):field.value??'',onChange:e=>store.updateField(d.id,index,e.target.value)}),field.source?h('small',null,` Page ${field.source.page??'?'}: ${field.source.excerpt??''}`):null)),
    d.result?h('details',null,h('summary',null,'JSON'),h('pre',null,JSON.stringify(d.result,null,2))):null,
    button('Export JSON',()=>downloadJSON(store.exportJSON(d.id)),!d.result),
    h('label',null,'Question or fields to find',h('textarea',{value:question,onChange:e=>setQuestion(e.target.value)})),
    button('Find fields',()=>store.query(d.id,question,'fields'),!d.result||d.queryPending||!question.trim()),
    button('Ask',()=>store.query(d.id,question,'chat'),!d.result||d.queryPending||!question.trim()),
    d.queryPending?h('p',{role:'status'},'Finding information…'):null,
    d.queryResult?h('pre',{'aria-live':'polite'},JSON.stringify(d.queryResult,null,2)):null),
   h('section',{style:{flex:'2 1 400px',minWidth:0}},h('h2',null,'Document preview'),
    d.file.type==='application/pdf'?h('object',{data:d.previewUrl,type:'application/pdf',style:{width:'100%',height:'700px'}},h('a',{href:d.previewUrl,target:'_blank',rel:'noopener'},'Open PDF')):h('img',{src:d.previewUrl,alt:d.name,style:{maxWidth:'100%'}})))
   :h('p',{key:'empty'},'Upload a document to begin.')
 ]);
}
