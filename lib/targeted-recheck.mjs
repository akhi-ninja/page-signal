import sharp from 'sharp';
import {verifyFields,cropRegion} from '../web/document-quality.mjs';
import {uniqueSourceRegion} from '../web/document-viewer.mjs';
const tokens=value=>String(value??'').toLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(' ')||'';
const key=f=>JSON.stringify([f.section??null,f.label]);
export async function prepareTargetedRecheck(result,page){
 if(!Array.isArray(page.words)||page.words.length>2000)return null;
 const counts=new Map();for(const f of result.fields||[])counts.set(key(f),(counts.get(key(f))||0)+1);
 for(const field of verifyFields(result,page.text||'')){
  if(counts.get(key(field))!==1||!['needs_review','illegible'].includes(field.verification.status))continue;
  if(!field.value||tokens(field.value)===tokens(field.label))continue;
  const candidates=[];
  if(field.value)candidates.push({kind:'value',text:field.value});
  if(field.evidence&&tokens(field.evidence)!==tokens(field.label)&&tokens(field.evidence).includes(tokens(field.value)))candidates.push({kind:'evidence',text:field.evidence});
  if(!candidates.length)continue;
  try{
   const box=uniqueSourceRegion({1:page.words},candidates,1);if(box.width*box.height>.35)continue;
   const input=Buffer.from(page.image.split(',')[1],'base64');const metadata=await sharp(input,{limitInputPixels:20000000}).metadata();
   const region=cropRegion(box,metadata.width,metadata.height,.03);
   const jpeg=await sharp(input,{limitInputPixels:20000000}).extract({left:region.x,top:region.y,width:region.width,height:region.height}).resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
   if(jpeg.length>1500000)continue;
   return {page:{image:'data:image/jpeg;base64,'+jpeg.toString('base64'),text:'',field_target:{section:field.section,label:field.label}},target:{section:field.section,label:field.label,box},mode:'crop_proposal'};
  }catch{/* No safe/unique region: preserve original and require review. */}
 }
 return null;
}
export function cropProposal(original,candidate,target){
 const matches=candidate.fields.filter(f=>f.label===target.label&&(f.section===target.section||f.section===null));
 if(matches.length!==1)return {result:original,rejected:['crop_target_not_unique']};
 return {result:{...original,vision_recheck:[{schema_version:1,target:{section:target.section,label:target.label},source:{box:target.box,coordinate_system:'normalized_upright_page'},proposal:matches[0],status:'needs_review',reason:'Visual proposal; compare against original before accepting.'}]},rejected:['vision_proposal_requires_review']};
}
