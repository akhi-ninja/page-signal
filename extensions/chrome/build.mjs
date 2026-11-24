import { copyFile, cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../../dist/chrome-extension/', import.meta.url);
const vendor = new URL('vendor/', output);
await mkdir(vendor, { recursive: true });

for (const file of ['manifest.json', 'background.js', 'panel.html', 'panel.css', 'panel.js', 'model.mjs', 'document.mjs']) {
  await copyFile(new URL(file, import.meta.url), new URL(file, output));
}

await cp(new URL("icons/", import.meta.url), new URL("icons/", output), { recursive: true });

const pdf = new URL('../../node_modules/pdfjs-dist/', import.meta.url);
for (const file of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  await copyFile(new URL('legacy/build/' + file, pdf), new URL(file, vendor));
}
await copyFile(new URL('LICENSE', pdf), new URL('pdfjs-LICENSE', vendor));
for (const directory of ['cmaps', 'standard_fonts']) {
  await cp(new URL(directory + '/', pdf), new URL(directory + '/', vendor), { recursive: true });
}
console.log('Load this directory in Chrome: ' + fileURLToPath(output));
