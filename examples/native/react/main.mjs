import React from 'react';
import {createRoot} from 'react-dom/client';
import {PageSignalWorkspace} from '@pagesignal/react';
import {adapter} from '../adapter.mjs';
import {previewRenderer} from '../pdf-renderer.mjs';
createRoot(document.getElementById('app')).render(React.createElement(PageSignalWorkspace,{adapter,enhancedPreview:true,previewRenderer}));
