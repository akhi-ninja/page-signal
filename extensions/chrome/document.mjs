const MAX_PAGES = 40;
const MAX_IMAGE_LENGTH = 3800000;
const MAX_EDGE = 1800;

function pageCanvas(width, height) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  return canvas;
}

function jpeg(canvas) {
  for (const quality of [0.85, 0.65, 0.45]) {
    const image = canvas.toDataURL('image/jpeg', quality);
    if (image.length <= MAX_IMAGE_LENGTH) return image;
  }
  throw new Error('This page is too large to extract.');
}

export async function* documentPages(file) {
  if (file.type !== 'application/pdf') {
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = pageCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      yield { page: 1, image: jpeg(canvas), text: '' };
    } finally {
      bitmap.close();
    }
    return;
  }

  const pdfjs = await import('./vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    useWasm: false,
    useSystemFonts: true,
    cMapUrl: chrome.runtime.getURL('vendor/cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: chrome.runtime.getURL('vendor/standard_fonts/'),
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > MAX_PAGES) throw new Error('Split this PDF into documents of 40 pages or fewer.');
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      try {
        const base = page.getViewport({ scale: 1 });
        const canvas = pageCanvas(base.width, base.height);
        const viewport = page.getViewport({ scale: canvas.width / base.width });
        await page.render({ canvas, canvasContext: canvas.getContext('2d', { alpha: false }), viewport }).promise;
        const content = await page.getTextContent();
        const text = content.items.map(item => item.str ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('');
        yield { page: number, image: jpeg(canvas), text: text.slice(0, 20000) };
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await task.destroy();
  }
}
