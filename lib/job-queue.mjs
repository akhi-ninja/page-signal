import {send} from '@vercel/queue';
export function enqueueDocumentJob(jobId,options={}){return send('pagesignal-document-jobs',{jobId},{region:'iad1',retentionSeconds:86400,...options});}
