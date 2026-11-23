// Explicit user choices, not a language/orientation classifier. No external calls.
export const OCR_LANGUAGES=Object.freeze({eng:'English',spa:'Spanish',fra:'French',hin:'Hindi',tam:'Tamil',mal:'Malayalam'});
export function readingOptions(value={}){
 const languages=value.languages??['eng'],rotation=value.rotation??0;
 if(!Array.isArray(languages)||!languages.length||languages.length>3||new Set(languages).size!==languages.length||languages.some(l=>!Object.hasOwn(OCR_LANGUAGES,l))||![0,90,180,270].includes(rotation))throw new TypeError('Choose supported OCR languages and a quarter-turn rotation');
 return {languages:[...languages],rotation};
}
export function imagePlan(width,height,{rotation=0,maxEdge=2300,maxPixels=8000000,targetWidth}={}){
 readingOptions({rotation});if(![width,height,maxEdge,maxPixels].every(v=>Number.isFinite(v)&&v>0)||maxEdge>4600||maxPixels>20000000||targetWidth!==undefined&&(!Number.isFinite(targetWidth)||targetWidth<=0))throw new TypeError('Invalid image dimensions/budget');
 const swapped=rotation===90||rotation===270,w=swapped?height:width,h=swapped?width:height;
 let scale=Math.min(3,maxEdge/Math.max(w,h),Math.sqrt(maxPixels/(w*h)),targetWidth===undefined?Infinity:targetWidth/w);
 let outputWidth=Math.max(1,Math.floor(w*scale)),outputHeight=Math.max(1,Math.floor(h*scale));
 // Use output dimensions for the affine map, preserving exact edge/coordinate alignment.
 const sx=outputWidth/w,sy=outputHeight/h;
 const matrix=rotation===90?[0,sy,-sx,0,outputWidth,0]:rotation===180?[-sx,0,0,-sy,outputWidth,outputHeight]:rotation===270?[0,-sy,sx,0,0,outputHeight]:[sx,0,0,sy,0,0];
 return {width:outputWidth,height:outputHeight,original_width:width,original_height:height,rotation_degrees:rotation,matrix,coordinate_system:'normalized_upright_page',orientation_source:rotation?'user':'unchanged',orientation_checked:false};
}
export function paintImage(canvas,image,plan){
 canvas.width=plan.width;canvas.height=plan.height;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,plan.width,plan.height);ctx.setTransform(...plan.matrix);ctx.drawImage(image,0,0,plan.original_width,plan.original_height);ctx.resetTransform();
}
