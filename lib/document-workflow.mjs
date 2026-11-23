import { Annotation, StateGraph, START, END, interrupt, Command } from '@langchain/langgraph';
import { verifyFields } from '../web/document-quality.mjs';
import { createHash } from 'node:crypto';
import { mergeRecheck } from './recheck-merge.mjs';
const scalar=x=>x===null||typeof x==='string';
const states=['filled','blank','illegible','checked','unchecked'];
/** Validate model output without inventing values. Shared by the graph and simple pipeline. */
export function inspectResult(result,sourceText=null) {
 const issues=[];
 if(!result||typeof result!=='object'||typeof result.document_type!=='string'||!Array.isArray(result.fields)||!Array.isArray(result.tables)||!Array.isArray(result.review_notes)) return ['invalid_result_shape'];
 if(!['identified','needs_review','unidentified'].includes(result.classification_status)) issues.push('invalid_classification_status');
 if(result.classification_status!=='identified'||result.document_type==='unknown') issues.push('classification_needs_review');
 for(const field of result.fields){
  if(!field||typeof field.label!=='string'||!scalar(field.section)||!scalar(field.value)||!scalar(field.evidence)||!states.includes(field.state)) {issues.push('invalid_field_shape');continue;}
  if(field.state==='illegible') issues.push('illegible_value');
  if(['blank','illegible','unchecked'].includes(field.state)&&field.value!==null) issues.push('inconsistent_field_state');
  if(/\be[- ]?mail\b/i.test(field.label)&&field.value!==null&&!/^\S+@\S+\.[^\s.]+$/.test(field.value)) issues.push('invalid_email');
 }
 for(const table of result.tables){
  if(!table||!Array.isArray(table.columns)||table.columns.some(c=>typeof c!=='string')||!Array.isArray(table.rows)||table.rows.some(r=>!Array.isArray(r)||r.some(c=>!scalar(c)))) {issues.push('invalid_table_shape');continue;}
  if(table.rows.some(r=>r.length!==table.columns.length)) issues.push('table_width_mismatch');
 }
 if(sourceText!==null&&!issues.includes('invalid_field_shape')&&verifyFields(result,sourceText).some(f=>f.verification.status==='needs_review'))issues.push('field_evidence_needs_review');
 return [...new Set(issues)];
}
const State=Annotation.Root({
 schemaVersion:Annotation(),attempts:Annotation(),result:Annotation(),issues:Annotation(),status:Annotation(),recheckSkipped:Annotation(),recheckIssues:Annotation()
});
export function workflowConfig({tenantId,documentId}){
 if(typeof tenantId!=='string'||!tenantId||typeof documentId!=='string'||!documentId||tenantId.length>256||documentId.length>256) throw new Error('Authenticated tenant and document IDs are required.');
 return {configurable:{thread_id:createHash('sha256').update(JSON.stringify([tenantId,documentId,'pagesignal-page-v1'])).digest('hex')},recursionLimit:16};
}
/** Page stays in the invocation closure, outside checkpointed state. A durable checkpointer is caller-owned. */
export function createPageWorkflow({page,extractPage,checkpointer,requireApproval=false,maxCalls=1,reserveAdditional=async()=>true}){
 if([process.env.LANGCHAIN_TRACING_V2,process.env.LANGSMITH_TRACING].some(v=>/^(true|1)$/i.test(v||''))&&process.env.PAGESIGNAL_ALLOW_EXTERNAL_TRACING!=='true')throw new Error('External tracing requires explicit document workflow consent.');
 if(typeof extractPage!=='function'||![1,2].includes(maxCalls)) throw new Error('Provide extractPage and maxCalls of 1 or 2.');
 if(requireApproval&&!checkpointer) throw new Error('Human pause/resume requires a checkpointer.');
 const builder=new StateGraph(State)
 .addNode('inspect',()=>{
  if(typeof page?.image!=='string'||page.image.length>3800000||!/^data:image\/jpeg;base64,[a-z0-9+/]+=*$/i.test(page.image)||typeof page.text!=='string'||page.text.length>20000) throw new Error('Invalid rendered page.');
  return {schemaVersion:1,status:'processing'};
 })
 .addNode('extract',async()=>({result:await extractPage(page),attempts:1}))
 .addNode('validate',state=>({issues:inspectResult(state.result,page?.text??'')}))
 .addNode('recheck',async state=>{
  if(!await reserveAdditional()) return {recheckSkipped:true};
  let result;
  try{result=await extractPage(page);}catch(error){
   if(error?.name==='AbortError'||error?.name==='TimeoutError')throw error;
   return {attempts:2,recheckIssues:['recheck_failed_original_preserved']};
  }
  const invalid=inspectResult(result,page?.text??'').some(i=>i.startsWith('invalid_')||i==='inconsistent_field_state'||i==='table_width_mismatch');
  if(invalid)return {attempts:2,recheckIssues:['invalid_recheck_result']};
  if(!state.result||!Array.isArray(state.result.fields)||!Array.isArray(state.result.tables)||inspectResult(state.result).some(i=>i.startsWith('invalid_')))return {attempts:2,recheckIssues:['invalid_original_requires_review']};
  const merged=mergeRecheck(state.result,result,page?.text??'');
  return {result:merged.result,attempts:2,recheckIssues:merged.rejected};
 })
 .addNode('validate_recheck',state=>({issues:[...inspectResult(state.result,page?.text??''),...(state.recheckIssues||[])]}))
 .addNode('review',state=>{
  if(!requireApproval) return {status:state.issues.length?'needs_review':'completed'};
  const decision=interrupt({schemaVersion:1,kind:'document_review',result:state.result,issues:state.issues});
  if(!decision||typeof decision.approved!=='boolean') throw new Error('Review decision must include approved boolean.');
  if(!decision.approved)return {status:'rejected',result:null};
  const result=decision.result??state.result;
  const issues=inspectResult(result);
  if(issues.some(i=>i.startsWith('invalid_')||i==='inconsistent_field_state'||i==='table_width_mismatch')) throw new Error('Correct invalid fields before approving.');
  return {result,issues,status:'completed'};
 })
 .addEdge(START,'inspect').addEdge('inspect','extract').addEdge('extract','validate')
 .addConditionalEdges('validate',state=>state.issues.length&&maxCalls===2?'recheck':'review',['recheck','review'])
 .addEdge('recheck','validate_recheck').addEdge('validate_recheck','review').addEdge('review',END);
 const graph=builder.compile({checkpointer});
 return {
  start:config=>graph.invoke({schemaVersion:1,attempts:0,result:null,issues:[],status:'processing',recheckSkipped:false,recheckIssues:[]},config),
  resume:(decision,config)=>graph.invoke(new Command({resume:decision}),config),
  graph
 };
}
