// Heuristics are review hints, not confidence scores or proof of readability.
export function assessScan({width,height,pixels}){
 const warnings=[];
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw new Error('Invalid page dimensions.');
 if(Math.min(width,height)<700)warnings.push('low_resolution');
 if(!pixels||pixels.length<4||pixels.length%4)throw new Error('Expected RGBA sample pixels.');
 let sum=0,squares=0,ink=0,n=0;
 for(let i=0;i<pixels.length;i+=4){const a=pixels[i+3]/255;const gray=(.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2])*a+255*(1-a);sum+=gray;squares+=gray*gray;ink+=Number(gray<220);n++;}
 const deviation=Math.sqrt(Math.max(0,squares/n-(sum/n)**2));
 if(ink/n<.002)warnings.push('possibly_blank');
 else if(deviation<12)warnings.push('low_contrast');
 return {schema_version:1,width,height,warnings,assessment:'heuristic',orientation_checked:false};
}
const norm=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,' ').trim();
export function verifyFields(result,text,page){
 const source=norm(text).toLowerCase();
 return (result.fields||[]).map(field=>{
  let status='needs_review';const reasons=[];
  if(field.reviewed){status='user_reviewed';}
  else if(field.state==='illegible'){status='illegible';reasons.push('value_unreadable');}
  else if(['checked','unchecked'].includes(field.state)){reasons.push('checkbox_requires_visual_review');}
  else if(field.value===null){status=field.state==='blank'?'blank':'not_found';}
  else{
   const value=norm(field.value),excerpt=norm(field.evidence);
   if(!value)reasons.push('empty_value');
   if(/\be[- ]?mail\b/i.test(field.label)&&!/^\S+@\S+\.[^\s.]+$/.test(value))reasons.push('invalid_email');
   if(/\bdate\b/i.test(field.label)){
    const match=value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(match){const [y,m,d]=match.slice(1).map(Number);const date=new Date(Date.UTC(y,m-1,d));if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)reasons.push('invalid_calendar_date');}
   }
   if(!excerpt)reasons.push('missing_evidence');
   else if(!source.includes(excerpt.toLowerCase()))reasons.push('evidence_not_in_transcript');
   else if(!excerpt.toLowerCase().includes(value.toLowerCase()))reasons.push('evidence_does_not_contain_value');
   if(!reasons.length)status='transcript_match';
  }
  return {...field,verification:{status,reasons,page}};
 });
}
export function reconcilePages(pages){
 const groups=new Map();
 for(const page of pages){
  if(page.error)continue;
  const identity=[page.document_type,page.form_number??''];
  const counts=new Map();
  for(const f of page.fields||[]){const key=JSON.stringify([...identity,norm(f.section),norm(f.label)]);counts.set(key,(counts.get(key)||0)+1);}
  for(const f of page.fields||[]){
   const key=JSON.stringify([...identity,norm(f.section),norm(f.label)]);
   if(f.value===null||!norm(f.value))continue;
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push({page:page.page,value:f.value,section:f.section,label:f.label,ambiguous:counts.get(key)>1});
  }
 }
 const conflicts=[];
 for(const sources of groups.values()){
  if(new Set(sources.map(s=>s.page)).size<2||sources.some(s=>s.ambiguous))continue;
  if(new Set(sources.map(s=>norm(s.value))).size>1)conflicts.push({label:sources[0].label,section:sources[0].section,status:'needs_review',reason:'different_values_across_pages',sources:sources.map(({ambiguous,...s})=>s)});
 }
 return {schema_version:1,status:conflicts.length?'needs_review':'no_conflicts_detected',conflicts,note:'Repeated values may be intentional. No values were merged or overwritten.'};
}
export function cropRegion(box,width,height,padding=.02){
 if(!box||![box.x,box.y,box.width,box.height,width,height,padding].every(Number.isFinite)||width<1||height<1||box.x<0||box.y<0||box.width<=0||box.height<=0||box.x+box.width>1||box.y+box.height>1||padding<0||padding>.2)throw new Error('Invalid normalized source region.');
 const x=Math.max(0,Math.floor((box.x-padding)*width)),y=Math.max(0,Math.floor((box.y-padding)*height));
 return {x,y,width:Math.min(width,Math.ceil((box.x+box.width+padding)*width))-x,height:Math.min(height,Math.ceil((box.y+box.height+padding)*height))-y};
}
