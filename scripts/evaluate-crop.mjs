// Two synthetic crop proposals at most; same default-model token cost guard as the paired benchmark.
import {readFile,writeFile} from 'node:fs/promises';
import {createPageWorkflow} from '../lib/document-workflow.mjs';import {prepareTargetedRecheck} from '../lib/targeted-recheck.mjs';import {targetedExtract} from '../lib/crop-extraction.mjs';import {providerMeter} from '../benchmark/provider-metrics.mjs';
if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='development'||process.env.PAGESIGNAL_RUN_BENCHMARK!=='crop-v2')throw Error('Explicit development-preview crop evaluation required');
const model=process.env.OPENAI_DOCUMENT_MODEL||'gpt-4.1-mini';if(!process.env.OPENAI_API_KEY)throw Error('Provider credential required');
const meter=providerMeter(fetch.bind(globalThis),{model,maxCostUsd:.50});globalThis.fetch=meter.fetch;
const image='data:image/jpeg;base64,'+(await readFile('benchmark/fixtures/invoice-ocr-corrupt.jpg')).toString('base64');
const cases=[{label:'Total',old:'4S.OO',expected:'45.00',x:94,y:317,width:65,height:24},{label:'Email',old:'billing example test',expected:'billing@example.test',x:108,y:223,width:225,height:24}];
const reports=[];
for(const c of cases){
 const field={section:null,label:c.label,value:c.old,state:'filled',evidence:c.old};const original={document_type:'invoice',form_number:null,classification_status:'identified',page_role:'standalone',fields:[field],tables:[],review_notes:[]};
 const page={image,text:c.label+': '+c.old,words:[{text:c.old,x:c.x/1050,y:c.y/750,width:c.width/1050,height:c.height/750}]};
 let calls=0,reserved=0;const before=performance.now();
 const state=await createPageWorkflow({page,maxCalls:2,prepareRecheck:prepareTargetedRecheck,reserveAdditional:async()=>{reserved++;return true;},extractPage:async input=>++calls===1?structuredClone(original):targetedExtract(input,{OPENAI_API_KEY:process.env.OPENAI_API_KEY,OPENAI_DOCUMENT_MODEL:model}).then(async response=>{if(!response.ok)throw Error('Crop request failed');return response.json();})}).start();
 const proposal=state.result.vision_recheck?.[0]?.proposal;reports.push({field:c.label,syntheticOriginalPreserved:state.result.fields[0].value===c.old,proposalPresent:Boolean(proposal),proposalExactMatch:proposal?.value===c.expected,requiresReview:state.status==='needs_review',extraModelCalls:reserved,latencyMs:Math.round(performance.now()-before)});
}
await writeFile('web/crop-evaluation-v2.json',JSON.stringify({schemaVersion:1,sourceRevision:process.env.VERCEL_GIT_COMMIT_SHA,model,createdAt:new Date().toISOString(),cases:reports,provider:meter.summary(),limitations:'Two controlled synthetic OCR-corruption crops; first-pass result and coordinates are fixture inputs. Only the crop call uses a live model. Not a general accuracy study, human handwriting test or comparison against full-page rechecks. No proposals are auto-applied.'},null,2)+'\n');console.log(JSON.stringify({syntheticCropCases:reports}));
