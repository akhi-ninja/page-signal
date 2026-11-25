import { validateFile } from './model.mjs';
import { documentPages } from './document.mjs';

const SITE = 'https://www.pagesignal.studio';
const $ = id => document.getElementById(id);
let file = null;
let source = null;
let previewUrl = null;
let result = null;
let work = null;
let signedIn = false;

function controls() {
  $('extract').disabled = Boolean(work) || !signedIn || (!file && !$('text').value.trim());
  $('export').disabled = Boolean(work) || !result?.pages.length;
  $('file').disabled = Boolean(work);
  $('text').disabled = Boolean(work) || Boolean(file);
  $('clear').textContent = work ? 'Cancel' : 'Clear';
}

async function credential() {
  const { pagesignalAuth } = await chrome.storage.local.get('pagesignalAuth');
  if (!pagesignalAuth || typeof pagesignalAuth.token !== 'string' ||
      !Number.isFinite(pagesignalAuth.expiresAt) || pagesignalAuth.expiresAt <= Date.now()) {
    if (pagesignalAuth) await chrome.storage.local.remove('pagesignalAuth');
    return null;
  }
  return pagesignalAuth.token;
}
async function request(path, options = {}) {
  const token = await credential();
  if (!token) throw new Error('Connect your PageSignal account to use document extraction.');
  const response = await fetch(new URL(path, SITE), {
    credentials: 'omit', redirect: 'error', cache: 'no-store', ...options,
    headers: { ...options.headers, Authorization: 'Bearer ' + token },
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('PageSignal returned an unexpected response.'); }
  if (response.ok) return data;
  if (response.status === 401) {
    signedIn = false;
    await chrome.storage.local.remove('pagesignalAuth');
    $('sign-in').hidden = false;
    $('account').textContent = 'Your PageSignal connection expired. Connect again to continue.';
  }
  throw new Error(data.error || 'PageSignal could not complete the request.');
}

async function checkAccount() {
  $('check-account').disabled = true;
  try {
    const { user } = await request('/api/extension/status');
    signedIn = Boolean(user);
    $('sign-in').hidden = signedIn;
    $('account').textContent = signedIn ? 'Connected securely to PageSignal.' : 'Connect your PageSignal account to extract.';
  } catch (error) {
    signedIn = false;
    $('sign-in').hidden = false;
    $('account').textContent = error.message || 'Could not verify your PageSignal connection.';
  } finally {
    $('check-account').disabled = false;
    controls();
  }
}

function releasePreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  $('preview').removeAttribute('src');
  $('preview').hidden = true;
}

function resetResult() {
  result = null;
  $('results').replaceChildren();
  controls();
}

function choose(selectedFile) {
  if (!selectedFile || work) return;
  file = null;
  source = null;
  $('text').value = '';
  releasePreview();
  resetResult();
  try {
    source = validateFile(selectedFile);
    file = selectedFile;
    if (file.type.startsWith('image/')) {
      previewUrl = URL.createObjectURL(file);
      $('preview').src = previewUrl;
      $('preview').hidden = false;
    }
    $('status').textContent = source.name + ' is ready to extract.';
  } catch (error) {
    $('file').value = '';
    $('status').textContent = error.message;
  } finally {
    controls();
  }
}

function addResult(page, data) {
  result.pages.push({ ...data, page });
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Page ' + page + ' · ' + (data.document_title || data.document_type || 'Extracted fields');
  details.append(summary);
  details.open = page === 1;
  const fields = document.createElement('dl');
  for (const field of data.fields || []) {
    const label = document.createElement('dt');
    const value = document.createElement('dd');
    label.textContent = field.label || 'Field';
    value.textContent = field.value == null ? 'Not found' : String(field.value);
    fields.append(label, value);
  }
  if (data.answer) {
    const answer = document.createElement('p');
    answer.textContent = data.answer;
    details.append(answer);
  }
  if (fields.childNodes.length) details.append(fields);
  else if (!data.answer) details.append(document.createTextNode('No fields were extracted from this page.'));
  $('results').append(details);
}

async function extract() {
  if (work || !signedIn || (!file && !$('text').value.trim())) return;
  const controller = new AbortController();
  work = controller;
  resetResult();
  result = { schema_version: 'pagesignal.extension-extraction.v1', status: 'in_progress', source: source || { type: 'selected_text' }, pages: [] };
  const submit = body => request('/api/ai/extract', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal,
  });
  try {
    $('status').textContent = 'Preparing extraction…';
    if (file) {
      for await (const { page, ...body } of documentPages(file)) {
        controller.signal.throwIfAborted();
        $('status').textContent = 'Extracting page ' + page + '…';
        addResult(page, await submit(body));
      }
    } else {
      const text = $('text').value.trim();
      addResult(1, await submit({
        operation: 'document_query', mode: 'fields', question: 'Extract key fields from the selected text.',
        pages: [{ page: 1, text }], context: '',
      }));
    }
    result.status = 'extracted';
    $('status').textContent = 'Extraction complete. Review the fields and export JSON.';
  } catch (error) {
    result.status = result.pages.length ? 'partial' : 'failed';
    $('status').textContent = (controller.signal.aborted ? 'Extraction cancelled.' : error.message) +
      (result.pages.length ? ' Completed pages are available as partial JSON.' : '');
  } finally {
    work = null;
    controls();
  }
}

function selection(value) {
  if (!value || work) return;
  file = null;
  source = { type: 'selected_text', captured_at: value.capturedAt };
  $('file').value = '';
  $('text').value = value.text;
  releasePreview();
  resetResult();
  $('status').textContent = 'Selected text is ready to extract.';
}

$('file').addEventListener('change', event => choose(event.target.files[0]));
$('drop').addEventListener('dragover', event => event.preventDefault());
$('drop').addEventListener('drop', event => {
  event.preventDefault();
  if (event.dataTransfer.files.length === 1) choose(event.dataTransfer.files[0]);
  else $('status').textContent = 'Drop one document at a time.';
});
$('text').addEventListener('input', resetResult);
$('sign-in').addEventListener('click', async () => {
  const challenge = Array.from(crypto.getRandomValues(new Uint8Array(32)),
    value => value.toString(16).padStart(2, '0')).join('');
  await chrome.storage.session.set({ pagesignalPair: { challenge, expiresAt: Date.now() + 300000 } });
  const url = new URL('/extension-connect', SITE);
  url.searchParams.set('extensionId', chrome.runtime.id);
  url.searchParams.set('challenge', challenge);
  await chrome.tabs.create({ url: url.href });
  $('account').textContent = 'Approve the connection in the PageSignal tab, then return here.';
});
$('check-account').addEventListener('click', checkAccount);
window.addEventListener('focus', () => { if (!work && !$('check-account').disabled) void checkAccount(); });
$('extract').addEventListener('click', extract);
$('clear').addEventListener('click', () => {
  if (work) { work.abort(); return; }
  file = null;
  source = null;
  releasePreview();
  $('file').value = '';
  $('text').value = '';
  void chrome.storage.session.remove('selection');
  resetResult();
  $('status').textContent = 'Cleared.';
});
$('export').addEventListener('click', () => {
  if (!result?.pages.length || work) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pagesignal-extraction.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
chrome.storage.session.get('selection').then(data => selection(data.selection));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.selection) selection(changes.selection.newValue);
  if (area === 'local' && changes.pagesignalAuth) void checkAccount();
});
window.addEventListener('pagehide', () => { work?.abort(); releasePreview(); });
void checkAccount();
