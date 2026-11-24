// Metadata-only identification; no licensed form templates are bundled.
const forms = Object.freeze({'125':'commercial-application','126':'general-liability','127':'business-auto','130':'workers-compensation','140':'property','131':'umbrella','137':'commercial-auto-coverage','25':'liability-certificate','28':'property-evidence'});
export function identifyAcordPages(pages) {
 if (!Array.isArray(pages)) throw new TypeError('Expected pages');
 return pages.map(p => {
  if (!Number.isSafeInteger(p.page)||p.page<1||typeof p.text!=='string') throw new TypeError('Invalid page');
  const matches=[...p.text.matchAll(/^\s*ACORD[ \t]+(\d{1,3})(?:[ \t]+\((\d{4})\/(0[1-9]|1[0-2])\))?[ \t]*$/gim)];
  const candidates=[...new Map(matches.map(m=>[m[1]+':'+(m[2]??'')+':'+(m[3]??''),{formNumber:m[1],revision:m[2]?m[2]+'-'+m[3]:null,evidence:m[0].trim()}])).values()];
  const candidate=candidates.length===1?candidates[0]:null;
  return {page:p.page,candidates,formNumber:candidate?.formNumber??null,revision:candidate?.revision??null,kind:candidate&&Object.hasOwn(forms,candidate.formNumber)?forms[candidate.formNumber]:null,status:!candidate?(candidates.length?'ambiguous':'unidentified'):!Object.hasOwn(forms,candidate.formNumber)?'unsupported':candidate.revision?'candidate':'revision_unknown',reviewRequired:true};
 });
}
export function selectAcordProfile(identification, profiles) {
 if(!Array.isArray(profiles)) throw new TypeError('Expected profiles');
 if(identification.status!=='candidate') return null;
 const matches=profiles.filter(p=>p.formNumber===identification.formNumber&&p.revision===identification.revision);
 if(matches.length>1) throw new TypeError('Duplicate form revision profiles');
 return matches.length?structuredClone(matches[0]):null;
}
