import pg from 'pg';
import { createWorkflowStore } from '../lib/workflow-checkpointer.mjs';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
try{await createWorkflowStore(pool).migrate();console.log('PageSignal workflow checkpoint schema is ready.');}finally{await pool.end();}
