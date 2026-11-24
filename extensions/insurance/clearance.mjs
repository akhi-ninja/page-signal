import {resolveBusinessCandidates} from './entity-resolution.mjs';
// Offline, caller-scoped synthetic records only. No clearance approval.
export function reviewAccountClearance({submission,accounts,synthetic}){
 if(synthetic!==true||!submission||typeof submission.id!=='string'||!submission.id.trim()||!Array.isArray(accounts))throw new TypeError('Synthetic submission and accounts required');
 const resolution=resolveBusinessCandidates({submitted:submission.business,candidates:accounts});
 const findings=[];
 for(const match of resolution.matches){
  const account=accounts.find(a=>a.id===match.id);
  if(!Array.isArray(account.submissions))throw new TypeError('Account submissions required');
  for(const s of account.submissions){
   if(!s||typeof s.id!=='string'||!s.id.trim()||typeof s.lineOfBusiness!=='string'||!s.lineOfBusiness.trim()||!['open','closed','bound','declined'].includes(s.status))throw new TypeError('Invalid existing submission');
   if(s.id===submission.id)continue;
   if(match.status==='candidate'&&s.lineOfBusiness===submission.lineOfBusiness&&['open','bound'].includes(s.status))findings.push({reason:'potential_duplicate',accountId:account.id,submissionId:s.id,source:match.source,evidence:match.evidence});
  }
  if(match.status==='conflict'&&match.signals.length) findings.push({reason:'identity_conflict',accountId:account.id,fields:match.conflicts,source:match.source,evidence:match.evidence});
 }
 if(typeof submission.lineOfBusiness!=='string'||!submission.lineOfBusiness.trim())throw new TypeError('Line of business required');
 return {synthetic:true,submissionId:submission.id,status:'needs_review',identityStatus:resolution.status,matches:resolution.matches,findings,requiresHumanReview:true};
}
