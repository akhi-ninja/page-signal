import pg from 'pg';
import {migrateJobSchema} from '../lib/document-jobs.mjs';
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
try{await migrateJobSchema(pool);console.log('Document job schema ready. No documents were created.');}finally{await pool.end();}
