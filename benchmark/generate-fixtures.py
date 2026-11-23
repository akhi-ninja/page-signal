"""Regenerate synthetic JPEG fixtures with Pillow 13; no real user documents."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageEnhance
import copy
root=Path(__file__).parent/'fixtures'
font=ImageFont.truetype('DejaVuSans.ttf',20)
def field(section,label,value,state='filled'):
 return dict(section=section,label=label,value=value,state=state)
def case(id,category,quality,lines,fields,tables=[],form=None):
 return dict(id=id,documentId=id.split('-page')[0],page=2 if id.endswith('page2') else 1,category=category,quality=quality,image=id+'.jpg',text='\n'.join(lines),provenance='Created for PageSignal benchmark; entirely synthetic; CC0-1.0.',expected=dict(document_type=category,form_number=form,fields=fields,tables=tables))
cases=[
 case('invoice-clean','invoice','clean',['SYNTHETIC BENCHMARK - NOT A REAL INVOICE','INVOICE','Invoice number: DEMO-104','Bill to: Example Workshop','Email: billing@example.test','Due date: 2026-12-01','Total: 45.00','Notes:','Description | Quantity | Amount','Paper packs | 2 | 30.00','Folders | 1 | 15.00'],[field(None,'Invoice number','DEMO-104'),field(None,'Bill to','Example Workshop'),field(None,'Email','billing@example.test'),field(None,'Due date','2026-12-01'),field(None,'Total','45.00'),field(None,'Notes',None,'blank')],[dict(title=None,columns=['Description','Quantity','Amount'],rows=[['Paper packs','2','30.00'],['Folders','1','15.00']])]),
 case('receipt-rotated','receipt','rotated',['SYNTHETIC BENCHMARK - NOT A REAL RECEIPT','RECEIPT','Merchant: Example Shop','Receipt number: DEMO-R7','Date: 2026-11-01','Total: 12.50','Payment: Cash'],[field(None,'Merchant','Example Shop'),field(None,'Receipt number','DEMO-R7'),field(None,'Date','2026-11-01'),field(None,'Total','12.50'),field(None,'Payment','Cash')]),
 case('form-repeated','custom_application_form','clean',['SYNTHETIC BENCHMARK - DEMONSTRATION ONLY','CUSTOM APPLICATION FORM','Form: DEMO-A1','Applicant','Name: Example Applicant','Email: applicant@example.test','Contact','Name: Example Contact','Email:','Consent: [X] Yes [ ] No'],[field('Applicant','Name','Example Applicant'),field('Applicant','Email','applicant@example.test'),field('Contact','Name','Example Contact'),field('Contact','Email',None,'blank'),field(None,'Yes','Yes','checked'),field(None,'No',None,'unchecked')],form='DEMO-A1'),
 case('letter-low-resolution','letter','low_resolution',['SYNTHETIC BENCHMARK - DEMONSTRATION ONLY','LETTER','Date: 2026-11-03','To: Example Team','Subject: Office hours','Opening time: 09:30','Regards: Example Sender'],[field(None,'Date','2026-11-03'),field(None,'To','Example Team'),field(None,'Subject','Office hours'),field(None,'Opening time','09:30'),field(None,'Regards','Example Sender')]),
 case('agreement-page1','contract','clean',['SYNTHETIC BENCHMARK - NOT A LEGAL AGREEMENT','SERVICE AGREEMENT','Agreement number: DEMO-C9','Provider: Example Provider','Customer: Example Customer','Start date: 2026-12-01','Page 1 of 2'],[field(None,'Agreement number','DEMO-C9'),field(None,'Provider','Example Provider'),field(None,'Customer','Example Customer'),field(None,'Start date','2026-12-01')]),
 case('agreement-page2','contract','continuation',['SYNTHETIC BENCHMARK - NOT A LEGAL AGREEMENT','SERVICE AGREEMENT - CONTINUED','Agreement number: DEMO-C9','Notice period: 30 days','Renewal date: 2027-12-01','Signature:','Page 2 of 2'],[field(None,'Agreement number','DEMO-C9'),field(None,'Notice period','30 days'),field(None,'Renewal date','2027-12-01'),field(None,'Signature',None,'blank')])
]
for c in cases:
 im=Image.new('RGB',(1050,750),'white');d=ImageDraw.Draw(im)
 for n,line in enumerate(c['text'].splitlines()): d.text((35,35+n*47),line,font=font,fill='black')
 if c['quality']=='rotated': im=im.rotate(90,expand=True,fillcolor='white')
 if c['quality']=='low_resolution': im=im.resize((420,300))
 im.save(root/c['image'],quality=80)
for suffix,quality in [('rotated180','upside_down'),('lowcontrast','low_contrast'),('ocr-corrupt','corrupted_ocr')]:
 c=copy.deepcopy(cases[0]);c['id']='invoice-'+suffix;c['documentId']=c['id'];c['quality']=quality;c['image']=c['id']+'.jpg'
 im=Image.open(root/'invoice-clean.jpg').convert('RGB')
 if suffix=='rotated180':im=im.rotate(180,expand=True)
 if suffix=='lowcontrast':im=ImageEnhance.Contrast(im).enhance(.12)
 if suffix=='ocr-corrupt':c['text']=c['text'].replace('billing@example.test','billing example test').replace('45.00','4S.OO')
 im.save(root/c['image'],quality=80);cases.append(c)
extra=[
 case('invoice-spanish','invoice','multilingual_spanish',['SYNTHETIC BENCHMARK - NOT A REAL INVOICE','FACTURA','Número de factura: DEMO-ES-12','Cliente: Taller Ejemplo','Correo: compras@example.test','Total: 125,50 EUR'],[field(None,'Número de factura','DEMO-ES-12'),field(None,'Cliente','Taller Ejemplo'),field(None,'Correo','compras@example.test'),field(None,'Total','125,50 EUR')]),
 case('receipt-french','receipt','multilingual_french',['SYNTHETIC BENCHMARK - NOT A REAL RECEIPT','REÇU','Commerce: Boutique Exemple','Numéro: DEMO-FR-09','Date: 2026-11-03','Total: 18,20 EUR'],[field(None,'Commerce','Boutique Exemple'),field(None,'Numéro','DEMO-FR-09'),field(None,'Date','2026-11-03'),field(None,'Total','18,20 EUR')]),
 case('form-unreadable','custom_application_form','illegible',['SYNTHETIC BENCHMARK - DEMONSTRATION ONLY','CUSTOM APPLICATION FORM','Form: DEMO-U1','Name: Example Applicant','Reference: ████████████','Email:'],[field(None,'Name','Example Applicant'),field(None,'Reference',None,'illegible'),field(None,'Email',None,'blank')],form='DEMO-U1'),
 case('agreement-conflict-page2','contract','conflicting_continuation',['SYNTHETIC BENCHMARK - NOT A LEGAL AGREEMENT','SERVICE AGREEMENT - CONTINUED','Agreement number: DEMO-C9','Customer: Different Example Customer','Notice period: 30 days','Page 2 of 2'],[field(None,'Agreement number','DEMO-C9'),field(None,'Customer','Different Example Customer'),field(None,'Notice period','30 days')])
]
extra[-1]['documentId']='agreement'
for c in extra:
 im=Image.new('RGB',(1050,750),'white');d=ImageDraw.Draw(im)
 for n,line in enumerate(c['text'].splitlines()):d.text((35,35+n*47),line,font=font,fill='black')
 im.save(root/c['image'],quality=80)
cases.extend(extra)
(root/'manifest.json').write_text(json.dumps(dict(version=3,license='CC0-1.0',fixtures=cases),indent=2)+'\n')
