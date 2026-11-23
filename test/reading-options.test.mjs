import test from 'node:test';import assert from 'node:assert/strict';
import {readingOptions,imagePlan,paintImage} from '../web/reading-options.mjs';
import {createCanvas} from '@napi-rs/canvas';
test('OCR languages and manual quarter-turns are bounded explicit user choices',()=>{
 assert.deepEqual(readingOptions(),{languages:['eng'],rotation:0});assert.deepEqual(readingOptions({languages:['eng','mal'],rotation:90}),{languages:['eng','mal'],rotation:90});
 for(const options of [{languages:['arbitrary']},{languages:[]},{languages:['eng','eng']},{rotation:30}])assert.throws(()=>readingOptions(options));
});
test('render plans keep pixel/edge budgets and affine geometry for all quarter-turns',()=>{
 for(const rotation of [0,90,180,270]){const p=imagePlan(3000,1000,{rotation});assert.ok(p.width*p.height<=8000000);assert.ok(Math.max(p.width,p.height)<=2300);const [a,b,c,d,e,f]=p.matrix;for(const [x,y] of [[0,0],[3000,0],[0,1000],[3000,1000]]){const u=a*x+c*y+e,v=b*x+d*y+f;assert.ok(u>=-1e-8&&u<=p.width+1e-8);assert.ok(v>=-1e-8&&v<=p.height+1e-8);}}
 assert.throws(()=>imagePlan(0,10));assert.throws(()=>imagePlan(10,10,{maxPixels:1e10}));
});
test('actual pixels rotate into the same upright coordinate frame used by OCR and previews',()=>{
 const source=createCanvas(40,20),ctx=source.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,40,20);ctx.fillStyle='red';ctx.fillRect(0,0,10,10);
 for(const [rotation,point] of [[0,[5,5]],[90,[15,5]],[180,[35,15]],[270,[5,35]]]){const output=createCanvas(1,1),plan=imagePlan(40,20,{rotation,maxEdge:40});paintImage(output,source,plan);const pixel=output.getContext('2d').getImageData(...point,1,1).data;assert.ok(pixel[0]>240&&pixel[1]<20&&pixel[2]<20);}
});
