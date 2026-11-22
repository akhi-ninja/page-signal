import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { workflowConfig } from './document-workflow.mjs';
/** Internal server helper. Authenticate owner IDs before calling; never accept tenantId from a request body. */
export function createWorkflowStore(pool) {
 if(!pool||typeof pool.query!=='function'||typeof pool.connect!=='function')throw new Error('A server-side Postgres pool is required.');
 const saver=new PostgresSaver(pool,undefined,{schema:'pagesignal_workflows'});
 return {
  checkpointer:saver,
  migrate:()=>saver.setup(),
  config:workflowConfig,
  // Explicit deletion supports document removal/retention. The caller enforces ownership.
  delete:owner=>saver.deleteThread(workflowConfig(owner).configurable.thread_id)
 };
}
