import { readFile, writeFile } from 'node:fs/promises';
import { compareReports } from '../benchmark/comparison.mjs';
const args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
if (!option('--baseline')||!option('--candidate')) throw new Error('Usage: npm run benchmark:compare -- --baseline PATH --candidate PATH [--max-drop 0.01] [--out PATH]');
const report=compareReports(JSON.parse(await readFile(option('--baseline'),'utf8')),JSON.parse(await readFile(option('--candidate'),'utf8')),{maxDrop:option('--max-drop')===undefined?0:Number(option('--max-drop'))});
if(option('--out')) await writeFile(option('--out'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(report.regressions.length) process.exitCode=1;
