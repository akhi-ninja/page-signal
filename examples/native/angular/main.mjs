import '@angular/compiler';
import {createApplication} from '@angular/platform-browser';
import {createComponent} from '@angular/core';
import {PageSignalWorkspaceComponent} from '@pagesignal/angular';
import {adapter} from '../adapter.mjs';
import {previewRenderer} from '../pdf-renderer.mjs';
const app=await createApplication();const component=createComponent(PageSignalWorkspaceComponent,{environmentInjector:app.injector,hostElement:document.getElementById('app')});component.setInput('adapter',adapter);component.setInput('enhancedPreview',true);component.setInput('previewRenderer',previewRenderer);app.attachView(component.hostView);component.changeDetectorRef.detectChanges();
