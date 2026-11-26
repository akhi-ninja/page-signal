export function cropProposal(original,candidate,target){
 const matches=candidate.fields.filter(f=>f.label===target.label&&(f.section===target.section||f.section===null));
 if(matches.length!==1)return {result:original,rejected:['crop_target_not_unique']};
 return {result:{...original,vision_recheck:[{schema_version:1,target:{section:target.section,label:target.label},source:{box:target.box,coordinate_system:'normalized_upright_page'},proposal:matches[0],status:'needs_review',reason:'Visual proposal; compare against original before accepting.'}]},rejected:['vision_proposal_requires_review']};
}
