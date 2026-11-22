import { validateFile, stagedDocument } from './model.mjs';
const $ = id => document.getElementById(id);
let source = null, imageUrl = null;
function releasePreview() { if (imageUrl) URL.revokeObjectURL(imageUrl); imageUrl = null; $('preview').removeAttribute('src'); $('preview').hidden = true; }
function choose(file) {
  try {
    const metadata = validateFile(file);
    releasePreview(); source = metadata;
    if (file.type.startsWith('image/')) { imageUrl = URL.createObjectURL(file); $('preview').src = imageUrl; $('preview').hidden = false; }
    $('status').textContent = `${metadata.name} staged locally. ${file.type === 'application/pdf' ? 'PDF rendering is coming in the next implementation step.' : 'Image preview ready.'} AI extraction is not connected yet.`;
  } catch (error) { $('status').textContent = error.message; }
}
$('file').addEventListener('change', e => choose(e.target.files[0]));
$('drop').addEventListener('dragover', e => e.preventDefault());
$('drop').addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files.length !== 1) { $('status').textContent = 'Drop one document at a time.'; return; } choose(e.dataTransfer.files[0]); });
function selection(value) { if (!value) return; releasePreview(); source = { type: 'selected_text', captured_at: value.capturedAt }; $('text').value = value.text; $('status').textContent = 'Selected text staged locally. Review before exporting.'; }
chrome.storage.session.get('selection').then(data => selection(data.selection));
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'session' && changes.selection) selection(changes.selection.newValue); });
$('clear').addEventListener('click', () => { source = null; releasePreview(); $('file').value = ''; $('text').value = ''; chrome.storage.session.remove('selection'); $('status').textContent = 'Staged content cleared.'; });
$('export').addEventListener('click', () => {
  if (!source && !$('text').value.trim()) { $('status').textContent = 'Stage a document or text first.'; return; }
  const url = URL.createObjectURL(new Blob([JSON.stringify(stagedDocument(source, $('text').value), null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'pagesignal-staged-document.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('pagehide', releasePreview);
