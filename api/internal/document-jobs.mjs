import {handleCallback} from '@vercel/queue';
import {processDocumentJob} from '../../lib/job-worker.mjs';
import {enqueueDocumentJob} from '../../lib/job-queue.mjs';
// SDK consumes the actual queue message by ID/receipt; arbitrary request JSON is not trusted.
const consume=handleCallback(message=>processDocumentJob(message,process.env,{enqueue:enqueueDocumentJob}),{visibilityTimeoutSeconds:180,retry:(_error,metadata)=>metadata.deliveryCount>=5?{acknowledge:true}:{afterSeconds:180}});
export default {fetch:consume};
