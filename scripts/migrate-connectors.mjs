import pg from 'pg';
import {connectorSchema} from '../lib/connector-store.mjs';
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
try{await pool.query(connectorSchema);console.log('Connection schema ready. No connections were created.')}finally{await pool.end()}
