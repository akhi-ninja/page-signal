import {build} from 'esbuild';
import {gzipSync} from 'node:zlib';
const entries={react:'packages/react/index.mjs',vue:'packages/vue/index.mjs',angular:'packages/angular/dist/fesm2022/pagesignal-angular.mjs'};
for(const [framework,entry] of Object.entries(entries)){
 const result=await build({entryPoints:[entry],bundle:true,write:false,minify:true,format:'esm',platform:'browser',external:['react','vue','@angular/*','rxjs','rxjs/*'],metafile:true});
 const bytes=result.outputFiles[0].contents;
 if(bytes.length>50000)throw Error(`${framework} bundle exceeds 50KB review budget`);
 if(Object.keys(result.metafile.inputs).some(p=>/pdfjs|tesseract|langgraph|better-auth|node:/.test(p)))throw Error('Unexpected heavy/server dependency');
 console.log(JSON.stringify({framework,minifiedBytes:bytes.length,gzipBytes:gzipSync(bytes).length,excludes:'framework peers; optional host PDF/OCR renderers',budgetBytes:50000}));
}
