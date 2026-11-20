/** Download OCR only when recognition is requested, not during the initial render. */
export function createOCRLoader({getWindow=()=>window,getDocument=()=>document,timeoutMs=30000}={}) {
 let pending;
 return function loadOCR() {
  if(getWindow().Tesseract)return Promise.resolve(getWindow().Tesseract);
  if(pending)return pending;
  pending=new Promise((resolve,reject)=>{
   const script=getDocument().createElement('script');let timer;
   const fail=()=>{clearTimeout(timer);script.remove();pending=null;reject(new Error('The OCR library could not load. Check your internet connection and retry.'));};
   script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';script.async=true;
   script.onload=()=>{if(!getWindow().Tesseract){fail();return;}clearTimeout(timer);resolve(getWindow().Tesseract);};
   script.onerror=fail;timer=setTimeout(fail,timeoutMs);getDocument().head.append(script);
  });
  return pending;
 };
}
export const loadOCR=createOCRLoader();
