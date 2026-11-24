import {reviewAccountClearance} from './engine/clearance.mjs';
import {reviewVehicle} from './engine/vehicle.mjs';
const $=id=>document.getElementById(id),el=(tag,t)=>{const e=document.createElement(tag);e.textContent=t;return e};
function run(){
 const scenario=$('risk-scenario').value,business={legalName:'Example Manufacturing LLC',duns:'123456789'};
 const r=scenario==='vehicle'?reviewVehicle({synthetic:true,submitted:{vin:'1M8GDM9AXKP042788',make:'Example',year:2020},record:{vin:'1M8GDM9AXKP042788',make:'Example',year:2021,bodyClass:'Truck',source:'Synthetic vehicle registry',evidence:'Fictional normalized record'}}):reviewAccountClearance({synthetic:true,submission:{id:'new',business,lineOfBusiness:'property'},accounts:[{...business,id:'ACCT-DEMO',duns:scenario==='conflict'?'987654321':business.duns,source:'Synthetic account inventory',evidence:'Fictional existing account',submissions:[{id:'SUB-DEMO',lineOfBusiness:'property',status:'open'}]}]});
 $('risk-metrics').replaceChildren(...[['Review status',r.status],['Findings',r.findings.length],['Source','Synthetic']].map(([k,v])=>{const d=el('div','');d.className='card';const m=el('div',v);m.className='metric';d.append(el('small',k),m);return d}));
 const table=el('table','');const head=el('tr','');for(const x of ['Field / account','Submitted / signals','Retrieved / conflicts','Status','Evidence'])head.append(el('th',x));table.append(head);
 for(const x of r.fields??r.matches){const tr=el('tr','');for(const v of [x.key??x.id,x.submitted??x.signals?.join(', '),x.retrieved??x.conflicts?.join(', '),x.status,x.source+' — '+x.evidence])tr.append(el('td',v??'—'));table.append(tr)}
 $('risk-results').replaceChildren(table);$('risk-findings').replaceChildren(...(r.findings.length?r.findings.map(f=>el('p',f.reason+' — '+(f.field??f.accountId))):[el('p','No sample findings; human review still required.')]));
}
$('risk-nav').onclick=()=>{for(const id of ['list','detail','lab'])$(id).hidden=true;$('risk').hidden=false;document.querySelectorAll('aside button').forEach(b=>b.removeAttribute('aria-current'));$('risk-nav').setAttribute('aria-current','true');run()};
for(const id of ['overview','inbox','acord-lab','loss-lab'])$(id).addEventListener('click',()=>{$('risk').hidden=true;$('risk-nav').removeAttribute('aria-current')});
$('risk-run').onclick=run;$('risk-scenario').onchange=run;
