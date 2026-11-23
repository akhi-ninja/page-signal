import {readFileSync,writeFileSync} from 'node:fs';
const expected=readFileSync('packages/sdk/document.mjs','utf8'),target='web/document-contract.mjs';
if(process.argv.includes('--check')){if(readFileSync(target,'utf8')!==expected)throw Error('Run node scripts/build-document-contract.mjs');}else writeFileSync(target,expected);
