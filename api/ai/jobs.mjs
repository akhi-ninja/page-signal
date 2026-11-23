import {documentJobs} from '../../lib/job-api.mjs';
import {enqueueDocumentJob} from '../../lib/job-queue.mjs';
export default {fetch(request){return documentJobs(request,process.env,{enqueue:enqueueDocumentJob});}};
