const formNumbers = {
 '25':'Certificate of Liability Insurance','27':'Evidence of Property Insurance','28':'Evidence of Commercial Property Insurance','35':'Cancellation Request / Policy Release','75':'Insurance Binder','80':'Homeowners Application','90':'Personal Auto Application','125':'Commercial Insurance Application','126':'Commercial General Liability Section','127':'Business Auto Section','130':'Workers Compensation Application','131':'Umbrella / Excess Section','137':'Commercial Auto Coverages / Limits','140':'Property Section','141':'Crime Section','146':'Equipment Floater Section','160':'Businessowners Application'
};
const common = {
 insured_name:['name of insured','named insured','insured name','applicant name','name of applicant','first named insured','insured'],
 agency:['agency name','producer name','producer','agency'],
 policy_number:['policy number','policy no.','policy #'],
 effective_date:['proposed effective date','policy effective date','effective date'],
 expiration_date:['proposed expiration date','policy expiration date','expiration date'],
 carrier:['insurance company','company name','carrier','insurer'],
 mailing_address:['insured mailing address','mailing address'],
 fein:['federal employer id number','federal id number','fein','federal tax id']
};
const types = {
 invoice:{vendor:['vendor name','supplier name','vendor','supplier','bill from','sold by'],invoice_number:['invoice number','invoice no.','invoice #','invoice id'],invoice_date:['invoice date','date issued','date'],due_date:['payment due date','due date'],purchase_order:['purchase order number','purchase order','po number','po #'],bill_to:['bill to','billed to','customer name','customer'],subtotal:['subtotal','sub total'],tax:['sales tax','tax amount','tax'],total:['invoice total','grand total','total amount','amount payable','total'],amount_due:['balance due','amount due'],currency:['currency']},
 purchase_order:{purchase_order:['purchase order number','order number','po number','po #'],order_date:['order date','date'],vendor:['vendor name','vendor','supplier'],ship_to:['ship to','delivery address'],total:['grand total','order total','total']},
 receipt:{merchant:['merchant name','merchant','store'],receipt_number:['receipt number','receipt #','transaction id'],transaction_date:['transaction date','receipt date','date'],tax:['sales tax','tax'],total:['grand total','amount paid','total'],payment_method:['payment method','payment type']},
 loss_run:{...common,claim_number:['claim number','claim no.','claim #'],loss_date:['date of loss','loss date'],claim_status:['claim status','status'],paid:['total paid','paid amount','paid'],reserve:['outstanding reserve','reserve'],incurred:['total incurred','incurred']},
 w9:{name:['name as shown on your income tax return','name of entity/individual','name'],business_name:['business name/disregarded entity name','business name'],tax_classification:['federal tax classification','tax classification'],address:['address'],taxpayer_id:['taxpayer identification number','employer identification number','social security number','tin','ein']},
 other:{document_number:['document number','reference number','reference'],date:['document date','date'],name:['name','company name'],email:['email','e-mail'],phone:['telephone','phone'],total:['grand total','total amount','total']}
};
const lineFields={
 '25':{certificate_holder:['certificate holder'],certificate_number:['certificate number'],general_liability_limit:['each occurrence'],description_of_operations:['description of operations']},
 '27':{property_address:['property location','location description'],coverage_amount:['amount of insurance'],deductible:['deductible']},
 '28':{property_address:['property location','location description'],coverage_amount:['amount of insurance'],deductible:['deductible']},
 '125':{business_description:['nature of business','description of operations'],sic:['sic code','sic'],naics:['naics code','naics'],annual_revenue:['annual revenues','annual revenue','annual sales']},
 '126':{each_occurrence_limit:['each occurrence'],general_aggregate:['general aggregate'],products_completed_operations:['products completed operations','products - comp/op agg'],annual_payroll:['annual payroll','payroll']},
 '127':{vehicle_count:['number of vehicles','vehicle count'],liability_limit:['combined single limit','liability limit'],garage_address:['garaging address','garage address']},
 '130':{annual_payroll:['estimated annual payroll','annual payroll','total payroll'],employee_count:['number of employees','employee count'],experience_modification:['experience modification','experience mod'],states:['states covered','states']},
 '140':{premises:['premises number','premises #','premises'],building:['building number','building #'],construction:['construction type','construction'],occupancy:['occupancy'],year_built:['year built'],building_limit:['building limit','building value'],deductible:['deductible']}
};
const typeLabels={acord_form:'ACORD form',invoice:'Invoice',purchase_order:'Purchase order',receipt:'Receipt',loss_run:'Loss run',w9:'IRS Form W-9',uscis_form:'USCIS form',government_form:'Government form',other:'Unclassified'};
function identifyPrintedForm(text){
 const normalized=text.normalize('NFKC').replace(/[‐‑‒–—−]/g,'-');
 const uscis=/\bU\s*\.?\s*S\s*\.?\s*C\s*\.?\s*I\s*\.?\s*S\b|U\.?S\.? Citizenship and Immigration Services|Department of Homeland Security/i;
 const explicit=normalized.match(/\b(?:USCIS|DHS)\s+Form\s+([I1l]\s*-\s*\d{2,4}[A-Z]{0,3})\b/i);
 const title=normalized.match(/Application\s+To\s+Extend\s*\/\s*Change\s+Nonimmigrant\s+Status/i);
 const printed=normalized.match(/\bForm\s+(?:No\.?\s*)?([I1l]\s*-\s*\d{2,4}[A-Z]{0,3})\b/i);
 const bare=title&&normalized.match(/\b[I1l]\s*-\s*539\b/i);
 const identifier=explicit?.[1]||((uscis.test(normalized)||title)&&printed?.[1])||bare?.[0];
 if(identifier){
   const form='I'+identifier.replace(/\s+/g,'').slice(1).toUpperCase();
   return {type:'uscis_form',form,title:form==='I-539'?'Application to Extend/Change Nonimmigrant Status':null,basis:'Printed USCIS form identifier'};
 }
 if(title)return {type:'uscis_form',form:'I-539',title:'Application to Extend/Change Nonimmigrant Status',basis:'Recognized USCIS application title'};
 const agency=normalized.match(/\b(IRS|SSA|CMS|FEMA|VA|DHS|USCIS)\s+Form\s+([A-Z0-9]+(?:\s*-\s*[A-Z0-9]+){0,3})\b/i);
 if(agency&&/\d/.test(agency[2])){
   const issuer=agency[1].toUpperCase(),form=agency[2].replace(/\s/g,'').toUpperCase();
   return {type:issuer==='IRS'&&form==='W-9'?'w9':'government_form',form,title:null,basis:'Printed '+issuer+' form identifier'};
 }
 return null;
}
function classify(text){
 const identified=identifyPrintedForm(text);
 if(identified)return identified;
 const acord=text.match(/\bAC[O0]RD\s*(?:FORM\s*)?[:#-]?\s*(\d{2,4})\b/i);
 if(acord)return {type:'acord_form',form:acord[1],basis:'ACORD form number'};
 const title=Object.entries(formNumbers).find(([,name])=>text.toLowerCase().includes(name.toLowerCase()));
 if(title)return {type:'acord_form',form:title[0],basis:'Recognized form title'};
 if(/\bacord\b/i.test(text))return {type:'acord_form',form:'',basis:'ACORD label'};
 if(/\b(?:W[ -]?9|request for taxpayer identification number)\b/i.test(text))return {type:'w9',form:'',basis:'W-9 title or identifier'};
 if(/\bloss run(?:s| report)?\b|\bclaims? experience report\b/i.test(text))return {type:'loss_run',form:'',basis:'Loss run heading'};
 if(/\b(?:tax invoice|commercial invoice|invoice\s*(?:number|no\.?|#|date))\b|^\s*invoice\s*$/im.test(text))return {type:'invoice',form:'',basis:'Invoice heading or identifier'};
 if(/^\s*(?:purchase order|purchase order number|po number)\b/im.test(text))return {type:'purchase_order',form:'',basis:'Purchase order heading'};
 if(/\b(?:receipt|amount paid|payment method)\b/i.test(text))return {type:'receipt',form:'',basis:'Receipt or payment label'};
 return {type:'other',form:'',basis:'No recognized heading'};
}
function extractFields(text,result){
 const schema=result.type==='acord_form'?{...common,...lineFields[result.form]}:(types[result.type]||types.other);
 const rows=text.split(/\r?\n/);
 const fields={};
 for(const [key,aliases] of Object.entries(schema)){
   fields[key]={value:null,page:null};
   let page=1;
   for(let i=0;i<rows.length;i++){
     const row=rows[i].trim();
     const marker=row.match(/^--- Page (\d+) ---$/);
     if(marker){page=Number(marker[1]);continue;}
     for(const alias of aliases){
       const pattern=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
       const match=row.match(new RegExp('^'+pattern+'(?:\\s*[:=]\\s*|\\s+-\\s+|\\s+)(.+)$','i'));
       const next=rows[i+1]?.trim();
       const value=match?.[1]?.trim()||(row.replace(/[:=]$/,'').trim().toLowerCase()===alias&&next&&!next.includes(':')&&!next.startsWith('---')?next:null);
       if(value){fields[key]={value,page};break;}
     }
     if(fields[key].value!==null)break;
   }
 }
 return fields;
}
