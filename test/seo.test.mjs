import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const pages = [
  {path:'/guides',file:'guides.html'},
  {path:'/guides/pdf-to-json',file:'guide-pdf-to-json.html'},
  {path:'/integrations',file:'integrations.html'}
];
const origin='https://www.pagesignal.studio';
test('public guides have canonical URLs, descriptive metadata and matching routes',()=>{
  const config=JSON.parse(readFileSync('vercel.json','utf8'));
  const sitemap=readFileSync('web/sitemap.xml','utf8');
  const server=readFileSync('server.mjs','utf8');
  const titles=new Set(), descriptions=new Set();
  for(const page of pages){
    const dom=new JSDOM(readFileSync('web/'+page.file,'utf8'));
    try{
      const doc=dom.window.document;
      assert.equal(doc.querySelectorAll('h1').length,1);
      assert(doc.querySelector('article')?.textContent.length>800);
      assert(!titles.has(doc.title));titles.add(doc.title);
      const description=doc.querySelector('meta[name="description"]')?.content;
      assert(description?.length>30);assert(!descriptions.has(description));descriptions.add(description);
      assert.equal(doc.querySelector('link[rel="canonical"]')?.href,origin+page.path);
      assert(!doc.querySelector('meta[name="robots"]')?.content.includes('noindex'));
      const schema=JSON.parse(doc.querySelector('script[type="application/ld+json"]')?.textContent||'null');
      assert.equal(schema?.['@graph']?.[0]?.url,origin+page.path);
      assert(sitemap.includes('<loc>'+origin+page.path+'</loc>'));
      assert(config.rewrites.some(r=>r.source===page.path&&r.destination==='/'+page.file));
      assert(config.redirects.some(r=>r.source==='/'+page.file&&r.destination===page.path));
      assert(server.includes("'"+page.path+"'"));
    }finally{dom.window.close();}
  }
});
test('guide links are discoverable and private community routes remain out of sitemap',()=>{
  const homepage=new JSDOM(readFileSync('web/index.html','utf8'));
  try{for(const p of pages)assert(homepage.window.document.querySelector('a[href="'+p.path+'"]'));}
  finally{homepage.window.close();}
  const sitemap=readFileSync('web/sitemap.xml','utf8');
  for(const route of ['/admin','/community'])assert(!sitemap.includes('<loc>'+origin+route+'</loc>'));
});
