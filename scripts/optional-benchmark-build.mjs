import { execFileSync } from 'node:child_process';
// Never run paid evaluation on production, feature branches, or ordinary previews.
if(process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='development'&&process.env.PAGESIGNAL_RUN_BENCHMARK==='nine-page-v2'){
 console.log('Running one bounded nine-page synthetic benchmark; no retries.');
 execFileSync(process.execPath,['scripts/evaluate-extraction.mjs','--live','--max-pages','9','--engine','langgraph','--max-cost-usd','0.50','--out','web/benchmark-live-v2.json'],{stdio:'inherit'});
}else console.log('Static app ready; paid benchmark is disabled.');
