import {readFileSync,writeFileSync} from 'node:fs';
const path='web/index.html',html=readFileSync(path,'utf8'),css=readFileSync('web/style.css','utf8');
if(/<\/style/i.test(css))throw new Error('Unexpected style closing tag in stylesheet');
const pattern=/<style id="workspace-style">[\s\S]*?<\/style>|<link rel="stylesheet" href="\/?style\.css">/;
if(!pattern.test(html))throw new Error('Workspace style placeholder missing');
const output=html.replace(pattern,()=>'<style id="workspace-style">\n'+css.trim()+'\n</style>');
if(process.argv.includes('--check')){
 if(output!==html)throw new Error('Run npm run styles:build');
 console.log('Embedded workspace style matches web/style.css');
}else{writeFileSync(path,output);console.log('Embedded workspace stylesheet');}
