import {mapAcordSubmission} from './acord-mapping.mjs';
import {reconcileLossRuns} from './loss-runs.mjs';
export function reviewSubmission({id,broker,application,lossHistory}){
 if(typeof id!=='string'||!id.trim()||typeof broker!=='string'||!broker.trim())throw new TypeError('Submission reference and broker required');
 if(application?.input?.id!==id)throw new TypeError('Application submission reference mismatch');
 const acord=mapAcordSubmission(application.input,application.profiles);
 const losses=reconcileLossRuns(lossHistory);
 const findings=[...acord.findings.map(f=>({...f,module:'application'})),...losses.findings.map(f=>({...f,module:'lossHistory'}))];
 return {id,broker,application:acord,lossHistory:losses,findings,status:'needs_review',lossAssociation:'review_required'};
}
