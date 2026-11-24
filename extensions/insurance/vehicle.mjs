// Offline normalized vehicle evidence; no network requests.
export function reviewVehicle({submitted,record,synthetic}){
 if(synthetic!==true||!submitted||!record||typeof record.source!=='string'||!record.source.trim()||typeof record.evidence!=='string'||!record.evidence.trim())throw new TypeError('Synthetic vehicle evidence required');
 const vin=v=>typeof v==='string'&&/^[A-HJ-NPR-Z0-9]{17}$/.test(v.toUpperCase())?v.toUpperCase():null;
 const a=vin(submitted.vin),b=vin(record.vin);
 const findings=[],fields=[];
 if(!a||!b||a!==b)findings.push({field:'vin',reason:'invalid_or_mismatched_vin'});
 for(const key of ['make','model','year','bodyClass','gvwr']){
 const x=submitted[key],y=record[key];
 const valid=v=>typeof v==='string'&&v.trim()||typeof v==='number'&&Number.isFinite(v);
 const status=!valid(y)?'unavailable':!valid(x)?'candidate':String(x).trim().toUpperCase()===String(y).trim().toUpperCase()?'match':'discrepancy';
 fields.push({key,submitted:x??null,retrieved:y??null,status,source:record.source,evidence:record.evidence});
 if(status==='discrepancy')findings.push({field:key,reason:'discrepancy'});
 }
 return {synthetic:true,status:'needs_review',vinFormatValid:!!a,vinMatches:!!a&&a===b,fields,findings};
}
