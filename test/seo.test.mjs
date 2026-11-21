import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const pages=JSON.parse(readFileSync('docs/seo-pages.json','utf8'));
const origin='https://www.pagesignal.studio';
test('public guide pages have unique indexable metadata, matching canonical/schema, static content and sitemap routes',()=>{
 const sitemap=readFileSync('web/sitemap.xml','utf8'),config=JSON.parse(readFileSync('vercel.json','utf8'));
 const titles=new Set(),descriptions=new Set();
 for(const page of pages){
  const dom=new JSDOM(readFileSync('web/'+page.file,'utf8')),{document}=dom.window;
  try{
   assert.equal(document.querySelectorAll('h1').length,1);assert.equal(document.querySelector('h1').textContent,page.heading);
   assert(!titles.has(document.title));titles.add(document.title);
   const description=document.querySelector('meta[name="description"]').content;assert(!descriptions.has(description));descriptions.add(description);
   assert.equal(document.querySelector('link[rel="canonical"]').href,origin+page.path);
   assert(!document.querySelector('meta[name="robots"]')?.content.includes('noindex'));
   assert(document.querySelector('article').textContent.length>800);
   const schema=JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);assert.equal(schema['@graph'][0].url,origin+page.path);
   assert(sitemap.includes('<loc>'+origin+page.path+'</loc>'));
   assert(config.rewrites.some(r=>r.source===page.path && r.destination==='/'+page.file));
   assert(config.redirects.some(r=>r.source==='/'+page.file && r.destination===page.path));
  }finally{dom.window.close();}
 }
});
test('homepage links all guides and private pages stay outside the sitemap and noindex',()=>{
 const dom=new JSDOM(readFileSync('web/index.html','utf8'));
 try{for(const page of pages)assert(dom.window.document.querySelector('a[href="'+page.path+'"]'));assert.match(dom.window.document.querySelector('title').textContent,/Open-Source AI Document Extraction/);}finally{dom.window.close();}
 const privatePage=readFileSync('web/community.html','utf8'),sitemap=readFileSync('web/sitemap.xml','utf8');assert(privatePage.includes('noindex'));assert(!sitemap.includes('/admin'));assert(!sitemap.includes('/community'));
});
