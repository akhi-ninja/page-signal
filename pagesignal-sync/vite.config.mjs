import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const pages = ['react', 'angular', 'vue'].map((name) => `demo/${name}.html`);

export default defineConfig({
  base: './',
  server: { port: 4173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    rollupOptions: {
      input: pages.map((page) => fileURLToPath(new URL(page, import.meta.url))),
    },
  },
  plugins: [{
    name: 'inventory-offline-shell',
    generateBundle(_options, bundle) {
      const files = new Set([...pages, ...Object.keys(bundle)]);
      const version = createHash('sha256');
      for (const page of pages) version.update(readFileSync(new URL(page, import.meta.url)));
      for (const file of Object.values(bundle)) version.update(file.type === 'asset' ? file.source : file.code);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `
          const prefix = 'pagesignal-sync-inventory:';
          const name = prefix + '${version.digest('hex')}';
          const files = ${JSON.stringify([...files])};
          const urls = new Set(files.map((file) => new URL(file, self.location.href).href));
          self.addEventListener('install', (event) => {
            event.waitUntil(caches.open(name).then((cache) => cache.addAll(files))
              .then(() => self.skipWaiting()));
          });
          self.addEventListener('activate', (event) => {
            event.waitUntil(caches.keys().then((keys) => Promise.all(keys
              .filter((key) => key.startsWith(prefix) && key !== name).map((key) => caches.delete(key))))
              .then(() => self.clients.claim()));
          });
          self.addEventListener('fetch', (event) => {
            if (event.request.method !== 'GET' || !urls.has(event.request.url)) return;
            event.respondWith(caches.open(name).then((cache) => cache.match(event.request.url, { ignoreVary: true }))
              .then((response) => response ?? fetch(event.request)));
          });
        `,
      });
    },
  }],
});
