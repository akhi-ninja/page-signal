// Conservative candidate matching; never confirms legal identity.
const norm=v=>typeof v==='string'?v.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim():'';
const duns=v=>typeof v==='string'&&/^\d{9}$/.test(v)?v:null;
export function resolveBusinessCandidates({submitted,candidates}){
 if(!submitted||!norm(submitted.legalName)||!Array.isArray(candidates))throw new TypeError('Business name and candidates required');
 const ids=new Set();
 const matches=candidates.map(c=>{
 if(!c||typeof c.id!=='string'||!c.id.trim()||ids.has(c.id)||!norm(c.legalName)||typeof c.source!=='string'||!c.source.trim()||typeof c.evidence!=='string'||!c.evidence.trim())throw new TypeError('Unique candidate and provenance required');
 ids.add(c.id);
 const signals=[],conflicts=[];
 const a=duns(submitted.duns),b=duns(c.duns);
 if(a&&b)(a===b?signals:conflicts).push('duns');
 for(const k of ['legalName','address','jurisdiction','registrationNumber']){
 const x=norm(submitted[k]),y=norm(c[k]);if(x&&y)(x===y?signals:conflicts).push(k);
 }
 const strong=signals.includes('duns')||(signals.includes('registrationNumber')&&signals.includes('jurisdiction'));
 const plausible=signals.includes('legalName')&&signals.includes('address')&&signals.includes('jurisdiction');
 return {id:c.id,source:c.source,evidence:c.evidence,signals,conflicts,status:conflicts.length?'conflict':strong||plausible?'candidate':'insufficient_evidence'};
 });
 const eligible=matches.filter(m=>m.status==='candidate');
 return {status:eligible.length>1?'ambiguous':eligible.length===1?'candidate_review':'unresolved',matches,requiresHumanReview:true};
}
