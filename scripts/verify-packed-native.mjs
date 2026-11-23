import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),cwd=await mkdtemp(join(tmpdir(),'pagesignal-consumer-'));
const npm=(args,where=root)=>execFileSync('npm',args,{cwd:where,stdio:['ignore','pipe','pipe'],encoding:'utf8',timeout:180000});
try{
 const files=[];
 for(const pkg of ['sdk','react','vue','angular']){
  const result=JSON.parse(npm(['pack',pkg==='angular'?'./packages/angular/dist':`./packages/${pkg}`,'--pack-destination',cwd,'--json']));files.push(join(cwd,result[0].filename));
 }
 const react=process.env.TEST_REACT_VERSION||'19.2.4';
 await writeFile(join(cwd,'package.json'),JSON.stringify({name:'pagesignal-packed-consumer',private:true,type:'module'}));
 npm(['install','--ignore-scripts','--no-audit','--no-fund',...files,`react@${react}`,`react-dom@${react}`,'vue@3.5.45','@angular/core@21.2.26','@angular/common@21.2.26','@angular/compiler@21.2.26','@angular/platform-browser@21.2.26','rxjs@7.8.2','typescript@5.9.3',`@types/react@${react.startsWith('18.')?'18.3.18':'19.2.14'}`,'jsdom@26.1.0','axe-core@4.11.0','@testing-library/user-event@14.6.1'],cwd);
 await writeFile(join(cwd,'verify.mjs'),`import '@angular/compiler';import {createWorkspace} from '@pagesignal/sdk/workspace';import {mountPreview} from '@pagesignal/sdk/preview';import {PageSignalWorkspace as ReactWorkspace} from '@pagesignal/react';import {PageSignalWorkspace as VueWorkspace} from '@pagesignal/vue';import {PageSignalWorkspaceComponent} from '@pagesignal/angular';if(typeof document!=='undefined')throw Error('Expected SSR environment');if(![createWorkspace,mountPreview,ReactWorkspace,VueWorkspace,PageSignalWorkspaceComponent].every(Boolean))throw Error('Missing exports');const store=createWorkspace({adapter:{extract:async()=>({fields:[]})}});store.dispose();console.log('Packed SSR imports and controller lifecycle passed');`);
 execFileSync(process.execPath,['verify.mjs'],{cwd,stdio:'inherit'});
 await writeFile(join(cwd,'verify.ts'),`import {PageSignalWorkspace,PageSignalWorkspaceProps} from '@pagesignal/react';import {PageSignalWorkspace as VueWorkspace} from '@pagesignal/vue';import {PageSignalWorkspaceComponent} from '@pagesignal/angular';import {PreviewRenderer,SourceEvidence} from '@pagesignal/sdk/preview';import {WorkspaceAdapter,createWorkspace} from '@pagesignal/sdk/workspace';const adapter:WorkspaceAdapter={extract:async()=>({fields:[]})};const props:PageSignalWorkspaceProps={adapter,enhancedPreview:true,onSourceNavigate:(source:SourceEvidence)=>console.log(source.page)};const controller=createWorkspace({adapter});controller.dispose();void [props,PageSignalWorkspace,VueWorkspace,PageSignalWorkspaceComponent];`);
 execFileSync(process.execPath,[join(cwd,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--module','NodeNext','--target','ES2022','--lib','ES2022,DOM','--skipLibCheck','false','verify.ts'],{cwd,stdio:'inherit'});
 const mountTests=(await readFile(join(root,'test/native-components.test.mjs'),'utf8')).replaceAll('../packages/vue/index.mjs','@pagesignal/vue').replaceAll('../packages/react/index.mjs','@pagesignal/react').replaceAll('../packages/angular/dist/fesm2022/pagesignal-angular.mjs','@pagesignal/angular');
 await writeFile(join(cwd,'mount.test.mjs'),mountTests);execFileSync(process.execPath,['--test','mount.test.mjs'],{cwd,stdio:'inherit'});
 console.log(`Packed native consumer verified: React ${react}, Vue 3.5.45, Angular 21.2.26`);
} catch(error){if(error.stdout)process.stderr.write(error.stdout);if(error.stderr)process.stderr.write(error.stderr);throw error;}finally{await rm(cwd,{recursive:true,force:true});}
