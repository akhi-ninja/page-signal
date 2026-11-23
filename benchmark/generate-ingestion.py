"""Synthetic CC0 PDF ingestion and drawn-stroke examples. No real customer handwriting."""
from pathlib import Path
import json,copy,fitz
from PIL import Image,ImageDraw,ImageFont
root=Path(__file__).parent/'fixtures';m=json.loads((root/'manifest.json').read_text());base={x['id']:x for x in m['fixtures']}
# Idempotent additions on top of the v3 generator.
m['fixtures']=[c for c in m['fixtures'] if not c.get('sourcePdf') and c['id']!='receipt-drawn-strokes']
def pdf(name,fixtures,scanned=False):
 doc=fitz.open()
 for f in fixtures:
  p=doc.new_page(width=700,height=500)
  if scanned:p.insert_image(p.rect,filename=str(root/f['image']))
  else:
   for n,line in enumerate(f['text'].splitlines()):p.insert_text((24,30+n*26),line,fontsize=12)
 doc.set_metadata({'title':'Synthetic PageSignal benchmark; CC0-1.0'})
 doc.save(root/name,no_new_id=True);doc.close()
def add(id,source,pdfname,page,quality,documentId):
 c=copy.deepcopy(base[source]);c.update(id=id,documentId=documentId,page=page,quality=quality,sourcePdf=pdfname,sourcePage=page,image=id+'.jpg')
 doc=fitz.open(root/pdfname);pix=doc[page-1].get_pixmap(matrix=fitz.Matrix(1.5,1.5));pix.save(root/c['image']);doc.close();m['fixtures'].append(c)
pdf('synthetic-text.pdf',[base['invoice-clean']]);add('pdf-text-page1','invoice-clean','synthetic-text.pdf',1,'text_pdf','pdf-text')
pdf('synthetic-scanned.pdf',[base['invoice-clean']],True);add('pdf-scanned-page1','invoice-clean','synthetic-scanned.pdf',1,'scanned_pdf_transcript_assisted','pdf-scanned')
pdf('synthetic-mixed.pdf',[base['agreement-page1'],base['agreement-page2'],base['invoice-clean']])
for n,source in enumerate(['agreement-page1','agreement-page2','invoice-clean'],1):add('pdf-mixed-page'+str(n),source,'synthetic-mixed.pdf',n,'mixed_pdf', 'pdf-contract' if n<3 else 'pdf-invoice')
im=Image.new('RGB',(1000,600),'white');d=ImageDraw.Draw(im);font=ImageFont.truetype('DejaVuSans.ttf',24)
d.text((40,35),'SYNTHETIC DRAWN-STROKE RECEIPT - DEMONSTRATION ONLY',font=font,fill='black');d.text((40,100),'RECEIPT',font=font,fill='black');d.text((40,185),'Total:',font=font,fill='black')
paths={'4':[[(45,0),(0,57),(61,57)],[(47,0),(44,102)]],'2':[[(0,18),(15,1),(40,0),(58,16),(55,37),(0,102),(64,102)]],'.':[[(25,96),(28,102)]],'5':[[(62,0),(5,0),(0,48),(37,44),(61,58),(60,83),(43,102),(15,102),(0,91)]],'0':[[(30,0),(6,9),(0,39),(4,85),(22,103),(45,99),(61,73),(60,27),(47,3),(30,0)]]}
x=220
for char in '42.50':
 for line in paths[char]:d.line([(x+a,175+b) for a,b in line],fill='black',width=5,joint='curve')
 x+=83
im.save(root/'receipt-drawn-strokes.jpg',quality=85)
c={'id':'receipt-drawn-strokes','documentId':'drawn-receipt','page':1,'category':'receipt','quality':'synthetic_handwriting_like','image':'receipt-drawn-strokes.jpg','text':'','provenance':'Created for PageSignal benchmark; entirely synthetic vector strokes; CC0-1.0. Not real human handwriting.','expected':{'document_type':'receipt','form_number':None,'fields':[{'section':None,'label':'Total','value':'42.50','state':'filled'}],'tables':[]}}
m['fixtures'].append(c);m['version']=4;(root/'manifest.json').write_text(json.dumps(m,indent=2)+'\n');print('Corpus v4:',len(m['fixtures']),'pages')
