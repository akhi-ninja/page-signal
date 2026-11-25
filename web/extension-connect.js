const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const extensionId=params.get('extensionId')||'';
const challenge=params.get('challenge')||'';
const valid=/^[a-p]{32}$/.test(extensionId)&&/^[a-f0-9]{64}$/.test(challenge);
let connectedAccount=false;
const message=value=>{$('message').textContent=value;};
function deliverGrant(token,expiresAt) {
 return new Promise((resolve,reject)=>{
  if(!globalThis.chrome?.runtime?.sendMessage) {
   reject(new Error('The Chrome extension is not installed or cannot receive the connection.'));return;
  }
  chrome.runtime.sendMessage(extensionId,{type:'pagesignal:pair',challenge,token,expiresAt},response=>{
   const error=chrome.runtime.lastError;
   if(error||!response?.ok)reject(new Error(response?.error||'The Chrome extension could not accept the connection. Reopen Connect from the extension.'));
   else resolve();
  });
 });
}
async function checkAccount(){
 if(!valid){message('Invalid extension connection request. Open the PageSignal extension and select Connect account.');return}
 $('check').disabled=true;
 try{
  const response=await fetch('/api/ai/status',{credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw new Error('Could not check your PageSignal sign-in.');
  const data=await response.json();
  connectedAccount=Boolean(data.user);
  $('approve').disabled=!connectedAccount;
  message(connectedAccount?'Signed in as '+(data.user.email||'PageSignal user')+'. Review the permission above, then approve.':
   'Sign in on the PageSignal website, then return to this tab and select Check sign-in.');
 }catch(error){connectedAccount=false;$('approve').disabled=true;message(error.message)}
 finally{$('check').disabled=false}
}
$('check').addEventListener('click',()=>void checkAccount());
$('approve').addEventListener('click',async()=>{
 if(!valid||!connectedAccount)return;
 $('approve').disabled=true;
 message('Authorizing your extension connection…');
 try{
  const response=await fetch('/api/extension/authorize',{
   method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({extensionId,challenge})
  });
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Could not authorize the extension.');
  await deliverGrant(data.token,Date.parse(data.expiresAt));
  message('Connected successfully. Return to the PageSignal side panel and extract your document.');
 }catch(error){message(error.message||'Connection failed.');$('approve').disabled=false}
});
window.addEventListener('focus',()=>{if(!$('approve').disabled||!connectedAccount)void checkAccount()});
void checkAccount();
