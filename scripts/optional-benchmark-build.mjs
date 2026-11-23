import { execFileSync } from 'node:child_process';
// Never run paid evaluation on production, feature branches, or ordinary previews.
if(process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='development'&&process.env.PAGESIGNAL_RUN_BENCHMARK==='nine-page-v2'){
 console.log('Running one bounded nine-page synthetic benchmark; no retries.');
 execFileSync(process.execPath,['scripts/evaluate-extraction.mjs','--live','--max-pages','9','--engine','langgraph','--max-cost-usd','0.50','--out','web/benchmark-live-v2.json'],{stdio:'inherit'});
}

else if(process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='development'&&process.env.PAGESIGNAL_RUN_BENCHMARK==='paired-v4'){
 console.log('Running one bounded paired 19-page synthetic benchmark; no retries.');
 for(const engine of ['pipeline','langgraph'])execFileSync(process.execPath,['scripts/evaluate-extraction.mjs','--live','--max-pages','19','--engine',engine,'--max-cost-usd','0.50','--out',`web/benchmark-${engine}-v4.json`],{stdio:'inherit'});
 try{execFileSync(process.execPath,['scripts/compare-extraction.mjs','--baseline','web/benchmark-pipeline-v4.json','--candidate','web/benchmark-langgraph-v4.json','--out','web/benchmark-comparison-v4.json'],{stdio:'inherit'});}catch(error){if(error.status!==1)throw error;}
}else console.log('Static app ready; paid benchmark is disabled.');

if(process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='development'&&['migrate','seed','verify','cleanup'].includes(process.env.PAGESIGNAL_JOB_SMOKE)){
 execFileSync(process.execPath,['scripts/job-smoke.mjs'],{stdio:'inherit'});
}
