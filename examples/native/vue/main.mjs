import {createApp,h} from 'vue';
import {PageSignalWorkspace} from '@pagesignal/vue';
import {adapter} from '../adapter.mjs';
import {previewRenderer} from '../pdf-renderer.mjs';
createApp({render:()=>h(PageSignalWorkspace,{adapter,enhancedPreview:true,previewRenderer})}).mount('#app');
