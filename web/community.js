(() => {
 if(location.hostname==='page-signal.vercel.app')location.replace('https://www.pagesignal.studio'+location.pathname+location.search);
 const $=id=>document.getElementById(id), admin=location.pathname.replace(/\/$/,'')==='/admin';
 const form=$('community-form');let page=1,busy=false,signingIn=false;
 async function providerAvailability(){
  try {const response=await fetch('/api/ai/status',{credentials:'same-origin',cache:'no-store'});if(!response.ok)return;const status=await response.json();const available=!admin && status.authConfigured && status.providers?.linkedin;$('login-linkedin').hidden=!available;$('login-linkedin').disabled=signingIn||!available;}catch{}
 }
 void providerAvailability();
 const date=value=>value?new Date(value).toISOString().slice(0,10):'—';
 const text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value??'';return node;};
 async function api(method='GET',data,view=''){
  const response=await fetch('/api/community'+view,{method,credentials:'same-origin',cache:'no-store',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});
  const result=await response.json();if(!response.ok){const error=new Error(result.error||'Request failed.');error.status=response.status;throw error;}return result;
 }
 function errorState(error){$('notice').textContent=error.message;if(error.status===401)$('login-panel').hidden=false;}
 async function load(){
  $('notice').textContent='Loading…';
  try{
   const data=await api('GET',undefined,admin?'?view=admin&page='+page:'');$('login-panel').hidden=true;
   if(admin){
    $('admin').hidden=false;$('admin-link').hidden=false;$('metrics').replaceChildren();
    for(const [label,value] of [['Registered accounts',data.summary.accounts],['Voluntary registrations',data.summary.registrations],['AI attempts · 30 days',data.summary.requests_30d]]){const box=text('div',label);box.className='metric';box.append(text('strong',value));$('metrics').append(box);}
    $('daily').replaceChildren();const maximum=Math.max(1,...data.daily.map(d=>d.requests));
    for(const day of data.daily){const row=document.createElement('div');row.className='chart-row';const meter=document.createElement('meter');meter.max=maximum;meter.value=day.requests;meter.setAttribute('aria-label',date(day.day)+': '+day.requests+' AI attempts');row.append(text('span',date(day.day)),meter,text('span',day.requests));$('daily').append(row);}
    if(!data.daily.length)$('daily').textContent='No hosted AI requests in this period.';
    $('users').replaceChildren();for(const user of data.users){const row=document.createElement('tr');for(const value of [user.name+'\n'+user.email,user.organization?user.organization+'\n'+user.use_case:(user.use_case||'No voluntary registration'),(user.integration||'—')+'\n'+(user.contact_opt_in?'Contact opted in':'No contact permission'),'Today: '+user.requests_today+'\n30 days: '+user.requests_30d,date(user.joined_at)+'\nLast AI: '+date(user.last_ai_day)])row.append(text('td',value));$('users').append(row);}
    $('page').textContent='Page '+page;$('previous').disabled=page===1;$('next').disabled=page*data.pageSize>=data.summary.accounts;
   }else{
    $('registration').hidden=false;$('admin-link').hidden=!data.isAdmin;$('identity').textContent='Signed in as '+data.user.email;
    const profile=data.profile;form.reset();if(profile){for(const name of ['organization','integration','use_case'])form.elements[name].value=profile[name];form.elements.contact_opt_in.checked=profile.contact_opt_in;form.elements.consent.checked=true;}
    $('withdraw').hidden=!profile;
   }
   $('notice').textContent='';
  }catch(error){errorState(error);}
 }
 if(new URLSearchParams(location.search).get('signin')==='failed')$('notice').textContent='Sign-in failed. Use your original provider if you already have an account.';
 if(admin){$('title').textContent='PageSignal admin';$('description').textContent='Registered accounts, voluntary registrations and hosted AI usage.';}
 for(const [id,provider] of [['login','github'],['login-linkedin','linkedin']]) $(id).addEventListener('click',async()=>{
  if(signingIn)return;signingIn=true;$('login').disabled=true;$('login-linkedin').disabled=true;$('notice').textContent='Opening '+(provider==='github'?'GitHub':'LinkedIn')+' sign-in…';
  try{const r=await fetch('/api/auth/sign-in/social',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider,callbackURL:admin?'/admin':'/community',errorCallbackURL:(admin?'/admin':'/community')+'?signin=failed'})});const data=await r.json();if(!r.ok)throw Error('Sign-in could not start. Try again.');const destination=new URL(data.url);if(destination.protocol!=='https:')throw Error('Invalid sign-in destination.');location.assign(destination.href);}catch(error){signingIn=false;errorState(error);$('login').disabled=false;$('login-linkedin').disabled=false;}
 });
 form.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;busy=true;$('save').disabled=true;
  try{await api('PUT',{organization:form.elements.organization.value,use_case:form.elements.use_case.value,integration:form.elements.integration.value,consent:form.elements.consent.checked,contact_opt_in:form.elements.contact_opt_in.checked});await load();$('notice').textContent='Registration saved. Thank you for sharing your use case.';}catch(error){errorState(error);}finally{busy=false;$('save').disabled=false;}
 });
 $('withdraw').addEventListener('click',async()=>{if(busy)return;busy=true;$('withdraw').disabled=true;try{await api('DELETE');await load();$('notice').textContent='Registration withdrawn. Your sign-in account and hosted usage records remain.';}catch(error){errorState(error);}finally{busy=false;$('withdraw').disabled=false;}});
 $('previous').addEventListener('click',()=>{if(page>1){page--;void load();}});$('next').addEventListener('click',()=>{page++;void load();});void load().then(()=>{if(new URLSearchParams(location.search).get('signin')==='failed')$('notice').textContent=new URLSearchParams(location.search).get('error')==='account_not_linked'?'This email already has an account. Sign in with your original provider, then open Account in the workspace and choose Connect LinkedIn.':'Sign-in failed or was cancelled. Use your original provider if you already have an account.';});
})();
