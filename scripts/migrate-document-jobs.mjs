import pg from 'pg';
import {JOB_SCHEMA} from '../lib/document-jobs.mjs';
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
try{await pool.query(JOB_SCHEMA);console.log('Document job schema ready. No documents were created.');}finally{await pool.end();}
