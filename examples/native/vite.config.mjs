import {defineConfig} from 'vite';
import {resolve} from 'node:path';
const framework=process.env.FRAMEWORK||'react';
if(!['react','vue','angular'].includes(framework))throw Error('Choose react, vue or angular');
export default defineConfig({resolve:{alias:{'@pagesignal/angular':resolve(import.meta.dirname,'../../packages/angular/dist/fesm2022/pagesignal-angular.mjs')}},root:resolve(import.meta.dirname,framework),server:{host:'127.0.0.1',port:5173,strictPort:true,fs:{allow:[resolve(import.meta.dirname,'../..')]},proxy:{'/api':'http://127.0.0.1:3100'}}});
